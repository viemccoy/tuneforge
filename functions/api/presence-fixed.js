// Presence endpoint with inline auth - no imports
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
  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversationId');
  const binId = url.searchParams.get('binId');
  
  try {
    // Authenticate
    const auth = await authenticate(request, env);
    if (auth.error) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!conversationId && !binId) {
      return new Response(JSON.stringify({ error: 'Conversation ID or Bin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle bin presence request
    if (binId && !conversationId) {
      const binPresence = await env.PRESENCE.get(`bin:${binId}`, 'json') || {};
      return new Response(JSON.stringify({ 
        binId,
        conversations: binPresence 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle conversation presence request
    const viewers = await env.PRESENCE.get(`viewers:${conversationId}`, 'json') || {};
    
    // Clean up expired viewers (older than 60 seconds)
    const now = Date.now();
    const activeViewers = {};
    
    for (const [userId, data] of Object.entries(viewers)) {
      if (now - data.timestamp < 60000) { // 60 seconds
        activeViewers[userId] = data;
      }
    }
    
    return new Response(JSON.stringify({ 
      conversationId,
      viewerCount: Object.keys(activeViewers).length,
      viewers: activeViewers 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in presence-fixed GET:', error);
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
    
    const { conversationId, userId, action } = await request.json();
    
    if (!conversationId || !userId || !action) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get current viewers
    const viewers = await env.PRESENCE.get(`viewers:${conversationId}`, 'json') || {};
    
    if (action === 'join') {
      // Add or update viewer
      viewers[userId] = {
        timestamp: Date.now(),
        sessionId: request.headers.get('CF-Ray') || userId
      };
    } else if (action === 'leave') {
      // Remove viewer
      delete viewers[userId];
    } else if (action === 'heartbeat') {
      // Update timestamp to keep alive
      if (viewers[userId]) {
        viewers[userId].timestamp = Date.now();
      }
    }
    
    // Save back to KV with 5 minute expiry (in case cleanup fails)
    await env.PRESENCE.put(
      `viewers:${conversationId}`, 
      JSON.stringify(viewers),
      { expirationTtl: 300 } // 5 minutes
    );
    
    // Also update bin presence
    if (action === 'join' || action === 'leave') {
      const binId = conversationId.split(':')[0]; // Extract binId if part of key
      const binPresence = await env.PRESENCE.get(`bin:${binId}`, 'json') || {};
      
      if (action === 'join') {
        binPresence[conversationId] = Object.keys(viewers).length;
      } else if (action === 'leave' && Object.keys(viewers).length === 0) {
        delete binPresence[conversationId];
      }
      
      await env.PRESENCE.put(
        `bin:${binId}`,
        JSON.stringify(binPresence),
        { expirationTtl: 300 }
      );
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      viewerCount: Object.keys(viewers).length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in presence-fixed POST:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}