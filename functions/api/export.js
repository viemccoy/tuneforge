// Export dataset endpoint
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
    // Get bin data
    const binData = await env.BINS.get(binId, 'json');
    if (!binData) {
      return new Response(JSON.stringify({ error: 'Bin not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get all conversations in the bin
    const list = await env.CONVERSATIONS.list({ prefix: `${binId}:` });
    const jsonlLines = [];
    
    for (const key of list.keys) {
      const convData = await env.CONVERSATIONS.get(key.name, 'json');
      if (convData) {
        // Format for OpenAI fine-tuning
        const formatted = {
          messages: convData.messages,
          metadata: convData.metadata
        };
        jsonlLines.push(JSON.stringify(formatted));
      }
    }
    
    const filename = `${binData.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.jsonl`;
    
    return new Response(jsonlLines.join('\n'), {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}