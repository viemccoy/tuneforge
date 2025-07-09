// Temporary bins endpoint with built-in auth to bypass middleware issues

async function authenticate(request, env) {
  // Get session token
  const token = request.headers.get('X-Session-Token');
  if (!token) {
    return { error: 'No session token', status: 401 };
  }
  
  // Get session
  const session = await env.SESSIONS.get(`session:${token}`, 'json');
  if (!session) {
    return { error: 'Invalid session', status: 401 };
  }
  
  // Get user
  const user = await env.USERS.get(`user:${session.email}`, 'json');
  if (!user) {
    return { error: 'User not found', status: 401 };
  }
  
  return { user, session };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  
  // Manual auth since middleware isn't working
  const auth = await authenticate(request, env);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const { user } = auth;
  
  try {
    // List all bins for the user's team
    const { keys } = await env.BINS.list({ prefix: `bin:${user.teamId}:` });
    
    const bins = await Promise.all(
      keys.map(async (key) => {
        const bin = await env.BINS.get(key.name, 'json');
        return bin;
      })
    );
    
    // Filter out any null entries
    const validBins = bins.filter(bin => bin !== null);
    
    return new Response(JSON.stringify({ 
      bins: validBins,
      teamId: user.teamId 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error loading bins:', error);
    return new Response(JSON.stringify({ 
      bins: [],
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Manual auth
  const auth = await authenticate(request, env);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const { user } = auth;
  
  try {
    const data = await request.json();
    const { name, systemPrompt, description = '' } = data;
    
    if (!name || !systemPrompt) {
      return new Response(JSON.stringify({ 
        error: 'Name and system prompt are required' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const binId = crypto.randomUUID();
    const bin = {
      id: binId,
      teamId: user.teamId,
      name,
      systemPrompt,
      description,
      createdBy: user.email,
      createdAt: new Date().toISOString(),
      conversationCount: 0,
      tokenCount: 0,
      models: []
    };
    
    await env.BINS.put(`bin:${user.teamId}:${binId}`, JSON.stringify(bin));
    
    return new Response(JSON.stringify(bin), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error creating bin:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create bin' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}