// Dynamic route handler for /api/bins/:id

export async function onRequestDelete({ params, env }) {
  const binId = params.id;
  
  console.log('DELETE request for bin ID:', binId);
  
  if (!env || !env.BINS) {
    return new Response(JSON.stringify({ error: 'KV namespace BINS is not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!binId) {
    return new Response(JSON.stringify({ error: 'Bin ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Check if bin exists
    const binData = await env.BINS.get(binId);
    if (!binData) {
      return new Response(JSON.stringify({ error: 'Bin not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Delete all conversations in the bin if CONVERSATIONS namespace exists
    if (env.CONVERSATIONS) {
      const conversationsList = await env.CONVERSATIONS.list({ prefix: `${binId}:` });
      for (const key of conversationsList.keys) {
        await env.CONVERSATIONS.delete(key.name);
      }
    }
    
    // Delete the bin
    await env.BINS.delete(binId);
    
    console.log('Successfully deleted bin:', binId);
    
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