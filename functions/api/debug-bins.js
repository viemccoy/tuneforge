// Debug endpoint to see all bins in KV
export async function onRequestGet(context) {
  const { request, env } = context;
  
  // Check auth
  let sessionToken = request.headers.get('X-Session-Token');
  if (!sessionToken) {
    const cookie = request.headers.get('Cookie');
    sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
  }
  
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Get session and user
  const session = await env.SESSIONS.get(`session:${sessionToken}`, 'json');
  if (!session) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const user = await env.USERS.get(`user:${session.email}`, 'json');
  if (!user || user.email !== 'vie@morpheus.systems') {
    return new Response(JSON.stringify({ 
      error: 'Access denied. Only vie@morpheus.systems can use debug endpoint.' 
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // List ALL bins in KV
    const list = await env.BINS.list();
    const allBins = [];
    const keyInfo = [];
    
    // Get each bin
    for (const key of list.keys) {
      const bin = await env.BINS.get(key.name, 'json');
      if (bin) {
        allBins.push({
          key: key.name,
          bin: bin
        });
        
        // Analyze key format
        const keyParts = key.name.split(':');
        keyInfo.push({
          fullKey: key.name,
          parts: keyParts,
          format: keyParts.length === 3 ? 'new (bin:team:id)' : 
                  keyParts.length === 2 ? 'partial' : 'old (just id)'
        });
      }
    }
    
    // Also check conversations
    const convList = await env.CONVERSATIONS.list({ limit: 10 });
    
    return new Response(JSON.stringify({
      user: user.email,
      team: user.teamId,
      binCount: allBins.length,
      conversationSample: convList.keys.length,
      keyFormats: keyInfo,
      bins: allBins,
      debug: {
        listComplete: list.list_complete,
        cursor: list.cursor
      }
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    return new Response(JSON.stringify({ 
      error: 'Debug failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}