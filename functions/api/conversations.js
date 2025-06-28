// Conversation management endpoints
export async function onRequestGet(context) {
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
    const list = await env.CONVERSATIONS.list({ prefix: `${binId}:` });
    const conversations = [];
    
    for (const key of list.keys) {
      const convData = await env.CONVERSATIONS.get(key.name, 'json');
      if (convData) {
        conversations.push({
          id: key.name.split(':')[1],
          ...convData
        });
      }
    }
    
    return new Response(JSON.stringify({ conversations }), {
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
    const { binId, messages, metadata } = await request.json();
    
    if (!binId || !messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid conversation data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate conversation ID
    const convId = crypto.randomUUID();
    const key = `${binId}:${convId}`;
    
    const conversationData = {
      messages,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        turnCount: messages.filter(m => m.role === 'user').length
      }
    };
    
    await env.CONVERSATIONS.put(key, JSON.stringify(conversationData));
    
    // Update bin conversation count
    const binData = await env.BINS.get(binId, 'json');
    if (binData) {
      binData.conversationCount = (binData.conversationCount || 0) + 1;
      binData.lastUpdated = new Date().toISOString();
      await env.BINS.put(binId, JSON.stringify(binData));
    }
    
    return new Response(JSON.stringify({ id: convId, ...conversationData }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const convId = pathParts.pop();
  const binId = url.searchParams.get('binId');
  
  if (!convId || !binId) {
    return new Response(JSON.stringify({ error: 'Conversation and Bin ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const key = `${binId}:${convId}`;
    await env.CONVERSATIONS.delete(key);
    
    // Update bin conversation count
    const binData = await env.BINS.get(binId, 'json');
    if (binData && binData.conversationCount > 0) {
      binData.conversationCount--;
      binData.lastUpdated = new Date().toISOString();
      await env.BINS.put(binId, JSON.stringify(binData));
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}