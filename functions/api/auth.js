// Email/password authentication endpoint

// Web Crypto API password verification
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
  console.log('[Auth] Creating session for user:', user.email);
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
  
  try {
    await env.SESSIONS.put(`session:${token}`, JSON.stringify(session));
    console.log('[Auth] Session created successfully:', token);
  } catch (error) {
    console.error('[Auth] Failed to store session:', error);
    throw error;
  }
  
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
  
  console.log('[Auth] Login attempt started');
  console.log('[Auth] Request URL:', request.url);
  console.log('[Auth] Request method:', request.method);
  
  try {
    const body = await request.text();
    console.log('[Auth] Request body:', body);
    
    let email, password;
    try {
      const parsed = JSON.parse(body);
      email = parsed.email;
      password = parsed.password;
    } catch (parseError) {
      console.error('[Auth] Failed to parse request body:', parseError);
      return new Response(JSON.stringify({ 
        error: "Invalid request body",
        details: parseError.message
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    console.log('[Auth] Login attempt for email:', email);
    
    if (!email) {
      return new Response(JSON.stringify({ 
        error: "Email required" 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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
    
    const valid = await verifyPassword(user.passwordHash, password);
    
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
    
    const headers = new Headers({
      'Content-Type': 'application/json'
    });
    
    // Cloudflare requires append for Set-Cookie headers
    // Try simpler cookie format first
    headers.append('Set-Cookie', `session=${session.token}; Path=/; SameSite=Lax`);
    
    const response = new Response(JSON.stringify({ 
      success: true,
      session: session.token,  // Include session token in response
      user: { 
        email: user.email, 
        teamId: user.teamId,
        role: user.role 
      }
    }), {
      headers: headers
    });
    
    console.log('[Auth] Sending response with Set-Cookie header:', `session=${session.token}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    return response;
    
  } catch (error) {
    console.error('Auth error:', error);
    return new Response(JSON.stringify({ 
      error: "Authentication failed",
      details: error.message
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
      'Access-Control-Max-Age': '86400',
    }
  });
}