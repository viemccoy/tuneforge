// Conversation Branching API
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversationId');
  const binId = url.searchParams.get('binId');
  
  if (!conversationId || !binId) {
    return new Response(JSON.stringify({ error: 'Conversation and Bin ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Get all branches for this conversation
    const branchPrefix = `branch:${binId}:${conversationId}:`;
    const list = await env.CONVERSATIONS.list({ prefix: branchPrefix });
    const branches = [];
    
    for (const key of list.keys) {
      const branchData = await env.CONVERSATIONS.get(key.name, 'json');
      if (branchData) {
        const branchId = key.name.split(':').pop();
        branches.push({
          id: branchId,
          ...branchData
        });
      }
    }
    
    // Get the main conversation
    const mainKey = `${binId}:${conversationId}`;
    const mainConv = await env.CONVERSATIONS.get(mainKey, 'json');
    
    return new Response(JSON.stringify({ 
      main: mainConv,
      branches,
      conversationId
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
    const { 
      binId, 
      conversationId, 
      branchPoint, 
      messages, 
      metadata 
    } = await request.json();
    
    if (!binId || !conversationId || branchPoint === undefined || !messages) {
      return new Response(JSON.stringify({ error: 'Invalid branch data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate branch ID
    const branchId = crypto.randomUUID();
    const key = `branch:${binId}:${conversationId}:${branchId}`;
    
    const branchData = {
      branchPoint,
      messages,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        parentConversation: conversationId
      }
    };
    
    await env.CONVERSATIONS.put(key, JSON.stringify(branchData));
    
    return new Response(JSON.stringify({ 
      id: branchId, 
      ...branchData 
    }), {
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

export async function onRequestPut(context) {
  const { request, env } = context;
  
  try {
    const { 
      binId, 
      conversationId, 
      branchId,
      action 
    } = await request.json();
    
    if (!binId || !conversationId || !branchId || !action) {
      return new Response(JSON.stringify({ error: 'Invalid merge data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'merge') {
      // Get branch data
      const branchKey = `branch:${binId}:${conversationId}:${branchId}`;
      const branchData = await env.CONVERSATIONS.get(branchKey, 'json');
      
      if (!branchData) {
        return new Response(JSON.stringify({ error: 'Branch not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Get main conversation
      const mainKey = `${binId}:${conversationId}`;
      const mainConv = await env.CONVERSATIONS.get(mainKey, 'json');
      
      if (!mainConv) {
        return new Response(JSON.stringify({ error: 'Main conversation not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Replace messages after branch point
      mainConv.messages = [
        ...mainConv.messages.slice(0, branchData.branchPoint),
        ...branchData.messages
      ];
      
      mainConv.metadata.lastMerged = new Date().toISOString();
      mainConv.metadata.mergedFrom = branchId;
      
      // Save updated main conversation
      await env.CONVERSATIONS.put(mainKey, JSON.stringify(mainConv));
      
      // Optionally delete the branch
      // await env.CONVERSATIONS.delete(branchKey);
      
      return new Response(JSON.stringify({ 
        success: true,
        conversation: mainConv
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}