// Bin management endpoints
export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    // List all bins
    const list = await env.BINS.list();
    const bins = [];
    
    for (const key of list.keys) {
      const binData = await env.BINS.get(key.name, 'json');
      if (binData) {
        bins.push({
          id: key.name,
          ...binData
        });
      }
    }
    
    return new Response(JSON.stringify({ bins }), {
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
    const { systemPrompt, name, description } = await request.json();
    
    if (!systemPrompt || !name) {
      return new Response(JSON.stringify({ error: 'System prompt and name are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate bin ID from system prompt hash
    const encoder = new TextEncoder();
    const data = encoder.encode(systemPrompt + Date.now());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const binId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    
    const binData = {
      name,
      description: description || '',
      systemPrompt,
      createdAt: new Date().toISOString(),
      conversationCount: 0,
      lastUpdated: new Date().toISOString()
    };
    
    await env.BINS.put(binId, JSON.stringify(binData));
    
    return new Response(JSON.stringify({ id: binId, ...binData }), {
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
  const binId = url.pathname.split('/').pop();
  
  if (!binId || binId === 'bins') {
    return new Response(JSON.stringify({ error: 'Bin ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Delete all conversations in the bin
    const conversationsList = await env.CONVERSATIONS.list({ prefix: `${binId}:` });
    for (const key of conversationsList.keys) {
      await env.CONVERSATIONS.delete(key.name);
    }
    
    // Delete the bin
    await env.BINS.delete(binId);
    
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