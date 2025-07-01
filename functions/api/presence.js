// Presence tracking for conversations
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversationId');
  
  if (!conversationId) {
    return new Response(JSON.stringify({ error: 'Conversation ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Get current viewers from KV with 60 second expiry
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
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
        sessionId: request.headers.get('CF-Ray') || userId // Use CF-Ray as session ID if available
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
    
    // Also update a global presence list for the bin
    if (action === 'join') {
      const binId = conversationId.split(':')[0]; // Extract binId if part of key
      const binPresence = await env.PRESENCE.get(`bin:${binId}`, 'json') || {};
      binPresence[conversationId] = Object.keys(viewers).length;
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Get presence for all conversations in a bin
export async function onRequestOptions(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const binId = url.searchParams.get('binId');
  
  if (!binId) {
    return new Response(JSON.stringify({ error: 'Bin ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const binPresence = await env.PRESENCE.get(`bin:${binId}`, 'json') || {};
    
    return new Response(JSON.stringify({ 
      binId,
      conversations: binPresence 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}