// User registration and password management

// Web Crypto API password hashing
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive key from password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  // Convert to base64 for storage
  const hashArray = new Uint8Array(derivedBits);
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  const saltBase64 = btoa(String.fromCharCode(...salt));
  
  // Return salt and hash combined
  return `${saltBase64}:${hashBase64}`;
}

async function verifyPassword(storedHash, password) {
  const [saltBase64, hashBase64] = storedHash.split(':');
  const salt = new Uint8Array(atob(saltBase64).split('').map(c => c.charCodeAt(0)));
  const storedHashArray = new Uint8Array(atob(hashBase64).split('').map(c => c.charCodeAt(0)));
  
  const encoder = new TextEncoder();
  
  // Derive key from password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive bits using same parameters
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  // Compare hashes
  const testHashArray = new Uint8Array(derivedBits);
  if (testHashArray.length !== storedHashArray.length) return false;
  
  for (let i = 0; i < testHashArray.length; i++) {
    if (testHashArray[i] !== storedHashArray[i]) return false;
  }
  
  return true;
}

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
    const { email, password, passwordConfirm } = await request.json();
    
    if (!email) {
      return new Response(JSON.stringify({ 
        error: "Email required" 
      }), { status: 400 });
    }
    
    console.log('Users endpoint - email:', email);
    
    // Check if this is a password check request
    if (!password && !passwordConfirm) {
      const user = await env.USERS.get(`user:${email}`, 'json');
      console.log('Existing user check:', user ? 'found' : 'not found');
      
      if (!user) {
        // Check if this is an allowed domain for auto-registration
        const domain = email.split('@')[1];
        console.log('Domain extracted:', domain);
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
          error: "User not found" 
        }), { status: 404 });
      }
      
      if (user.isFirstLogin) {
        return new Response(JSON.stringify({ 
          requiresPassword: true,
          message: "Create your password" 
        }));
      } else {
        return new Response(JSON.stringify({ 
          requiresPassword: false,
          message: "Enter your password" 
        }));
      }
    }
    
    // Password creation/update flow
    if (password && passwordConfirm) {
      if (password !== passwordConfirm) {
        return new Response(JSON.stringify({ 
          error: "Passwords do not match" 
        }), { status: 400 });
      }
      
      if (password.length < 8) {
        return new Response(JSON.stringify({ 
          error: "Password must be at least 8 characters" 
        }), { status: 400 });
      }
      
      // Get existing user or create new one
      let user = await env.USERS.get(`user:${email}`, 'json');
      
      if (!user) {
        return new Response(JSON.stringify({ 
          error: "User not found" 
        }), { status: 404 });
      }
      
      // Hash password using Web Crypto API
      const passwordHash = await hashPassword(password);
      
      // Update user with password
      user.passwordHash = passwordHash;
      user.isFirstLogin = false;
      user.lastLogin = new Date().toISOString();
      
      await env.USERS.put(`user:${email}`, JSON.stringify(user));
      
      // Ensure user is in team
      await ensureTeam(env, email);
      
      // Create session
      const session = await createSession(env, user);
      
      const headers = new Headers({
        'Content-Type': 'application/json'
      });
      
      // Cloudflare requires append for Set-Cookie headers
      // Try simpler cookie format first
      headers.append('Set-Cookie', `session=${session.token}; Path=/; SameSite=Lax`);
      
      return new Response(JSON.stringify({ 
        success: true,
        session: session.token,
        user: { 
          email: user.email, 
          teamId: user.teamId,
          role: user.role
        }
      }), {
        headers: headers
      });
    }
    
    return new Response(JSON.stringify({ 
      error: "Invalid request" 
    }), { status: 400 });
    
  } catch (error) {
    console.error('User registration error:', error);
    return new Response(JSON.stringify({ 
      error: "Internal server error" 
    }), { status: 500 });
  }
}

// Logout endpoint
export async function onRequestDelete(context) {
  const { request, env } = context;
  
  const cookie = request.headers.get('Cookie');
  const sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
  
  if (sessionToken) {
    await env.SESSIONS.delete(`session:${sessionToken}`);
  }
  
  const headers = new Headers({
    'Content-Type': 'application/json'
  });
  
  headers.append('Set-Cookie', 'session=; Path=/; SameSite=Lax; Max-Age=0');
  
  return new Response(JSON.stringify({ success: true }), {
    headers: headers
  });
}