// Dynamic route handler for /api/conversations/:id

export async function onRequestDelete({ params, request, env }) {
  const conversationId = params.id;
  const url = new URL(request.url);
  const binId = url.searchParams.get('binId');
  
  if (!env || !env.CONVERSATIONS) {
    return new Response(JSON.stringify({ error: 'KV namespace CONVERSATIONS is not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!conversationId || !binId) {
    return new Response(JSON.stringify({ error: 'Conversation and Bin ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const key = `${binId}:${conversationId}`;
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
    console.error('Delete error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPut({ params, request, env }) {
  const conversationId = params.id;
  
  if (!env || !env.CONVERSATIONS) {
    return new Response(JSON.stringify({ error: 'KV namespace CONVERSATIONS is not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!conversationId) {
    return new Response(JSON.stringify({ error: 'Conversation ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const { binId, messages, metadata, name } = await request.json();
    
    if (!binId || !messages) {
      return new Response(JSON.stringify({ error: 'Invalid conversation data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const key = `${binId}:${conversationId}`;
    
    // Check if conversation exists
    const existing = await env.CONVERSATIONS.get(key);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const existingData = JSON.parse(existing);
    
    const conversationData = {
      ...existingData,
      messages,
      name,
      metadata: {
        ...existingData.metadata,
        ...metadata,
        updatedAt: new Date().toISOString(),
        turnCount: messages.filter(m => m.role === 'user').length
      }
    };
    
    await env.CONVERSATIONS.put(key, JSON.stringify(conversationData));
    
    return new Response(JSON.stringify({ id: conversationId, ...conversationData }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Update error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}