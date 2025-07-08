// Email/password authentication endpoint
import { verify } from '@node-rs/argon2';

// Helper to create a secure session
async function createSession(env, user) {
  const token = crypto.randomUUID();
  const session = {
    token,
    userId: user.id,
    email: user.email,
    teamId: user.teamId,
    role: user.role || 'member',
    createdAt: new Date().toISOString()
    // NO expiry field - sessions persist forever
  };
  
  await env.SESSIONS.put(`session:${token}`, JSON.stringify(session));
  
  return session;
}

// Helper to ensure team exists
async function ensureTeam(env, email) {
  const domain = email.split('@')[1];
  const teamId = domain.replace(/\./g, '-');
  
  const existingTeam = await env.TEAMS.get(`team:${teamId}`, 'json');
  if (!existingTeam) {
    const team = {
      id: teamId,
      name: domain,
      domain: domain,
      members: [email],
      createdAt: new Date().toISOString(),
      settings: {
        allowAutoJoin: true
      }
    };
    
    await env.TEAMS.put(`team:${teamId}`, JSON.stringify(team));
    return team;
  } else {
    // Add member to team if not already there
    if (!existingTeam.members.includes(email)) {
      existingTeam.members.push(email);
      await env.TEAMS.put(`team:${teamId}`, JSON.stringify(existingTeam));
    }
    return existingTeam;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { email, password } = await request.json();
    
    if (!email) {
      return new Response(JSON.stringify({ 
        error: "Email required" 
      }), { status: 400 });
    }
    
    // Get user
    const user = await env.USERS.get(`user:${email}`, 'json');
    
    if (!user) {
      // Check if this is an allowed email for auto-registration
      const domain = email.split('@')[1];
      if (domain === 'morpheus.systems') {
        // Auto-create user account
        const team = await ensureTeam(env, email);
        const newUser = {
          id: crypto.randomUUID(),
          email,
          teamId: team.id,
          role: email === 'vie@morpheus.systems' ? 'admin' : 'member',
          isFirstLogin: true,
          createdAt: new Date().toISOString()
        };
        
        await env.USERS.put(`user:${email}`, JSON.stringify(newUser));
        
        return new Response(JSON.stringify({ 
          requiresPassword: true,
          message: "Create your password" 
        }));
      }
      
      return new Response(JSON.stringify({ 
        error: "Invalid credentials" 
      }), { status: 401 });
    }
    
    // Check if first login
    if (user.isFirstLogin) {
      return new Response(JSON.stringify({ 
        requiresPassword: true,
        message: "Create your password" 
      }));
    }
    
    // Verify password
    if (!password) {
      return new Response(JSON.stringify({ 
        error: "Password required" 
      }), { status: 400 });
    }
    
    const valid = await verify(user.passwordHash, password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    
    if (!valid) {
      return new Response(JSON.stringify({ 
        error: "Invalid credentials" 
      }), { status: 401 });
    }
    
    // Update last login
    user.lastLogin = new Date().toISOString();
    await env.USERS.put(`user:${email}`, JSON.stringify(user));
    
    // Create persistent session
    const session = await createSession(env, user);
    
    return new Response(JSON.stringify({ 
      success: true,
      user: { 
        email: user.email, 
        teamId: user.teamId,
        role: user.role 
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `session=${session.token}; Path=/; HttpOnly; Secure; SameSite=Strict`
      }
    });
    
  } catch (error) {
    console.error('Auth error:', error);
    return new Response(JSON.stringify({ 
      error: "Authentication failed" 
    }), { status: 500 });
  }
}