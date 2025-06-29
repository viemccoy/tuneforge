// Dynamic route handler for /api/conversations/:id

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