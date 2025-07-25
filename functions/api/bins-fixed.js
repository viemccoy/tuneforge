// Bins endpoint with inline auth - no imports
async function authenticate(request, env) {
  // Get session token
  let sessionToken = request.headers.get('X-Session-Token');
  if (!sessionToken) {
    const cookie = request.headers.get('Cookie');
    sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
  }
  
  if (!sessionToken) {
    return { error: 'No session token', status: 401 };
  }
  
  // Get session from KV
  const session = await env.SESSIONS.get(`session:${sessionToken}`, 'json');
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
  
  try {
    // Authenticate
    const auth = await authenticate(request, env);
    if (auth.error) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { user } = auth;
    
    // List all bins in the namespace
    const { keys } = await env.BINS.list();
    
    const userBins = [];
    
    // Check each bin to see if user has access
    for (const key of keys) {
      const bin = await env.BINS.get(key.name, 'json');
      if (bin) {
        // Check visibility settings
        const visibility = bin.visibility || 'team'; // Default to team visibility
        
        // Include bin if:
        // 1. Personal bin created by user
        // 2. Team bin that belongs to user's team
        // 3. Old bin without team assignment (legacy support)
        
        if (visibility === 'personal') {
          // Personal bins are only visible to creator
          if (bin.createdBy === user.email) {
            userBins.push(bin);
          }
        } else if (visibility === 'team') {
          // Team bins are visible to all team members
          if (bin.teamId === user.teamId || 
              (!bin.teamId && bin.createdBy === user.email) ||
              (!bin.teamId && !bin.createdBy)) {
            userBins.push(bin);
          }
        }
      }
    }
    
    return new Response(JSON.stringify({ 
      bins: userBins,
      teamId: user.teamId 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in bins-fixed GET:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    // Authenticate
    const auth = await authenticate(request, env);
    if (auth.error) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { user } = auth;
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
      models: [],
      visibility: 'team' // Default to team visibility
    };
    
    await env.BINS.put(`bin:${user.teamId}:${binId}`, JSON.stringify(bin));
    
    return new Response(JSON.stringify(bin), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in bins-fixed POST:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const binId = url.searchParams.get('id');
  
  try {
    // Authenticate
    const auth = await authenticate(request, env);
    if (auth.error) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { user } = auth;
    
    if (!binId) {
      return new Response(JSON.stringify({ error: 'Bin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get the bin to check ownership
    const binKey = `bin:${user.teamId}:${binId}`;
    const bin = await env.BINS.get(binKey, 'json');
    
    if (!bin) {
      return new Response(JSON.stringify({ error: 'Bin not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if user has permission to delete (must be creator or admin)
    if (bin.createdBy !== user.email && user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only the bin creator can delete this bin' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Delete all conversations in this bin
    const convList = await env.CONVERSATIONS.list({ prefix: `${binId}:` });
    for (const key of convList.keys) {
      await env.CONVERSATIONS.delete(key.name);
    }
    
    // Also check for conversations with binId field
    const allConvList = await env.CONVERSATIONS.list({ limit: 1000 });
    for (const key of allConvList.keys) {
      const conv = await env.CONVERSATIONS.get(key.name, 'json');
      if (conv && conv.binId === binId) {
        await env.CONVERSATIONS.delete(key.name);
      }
    }
    
    // Delete the bin
    await env.BINS.delete(binKey);
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Bin and all associated conversations deleted successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in bins-fixed DELETE:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}