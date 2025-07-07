// Conversation management endpoints with comprehensive logging

// Helper function to log events
function logEvent(env, event, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    ...data
  };
  
  // Log to console (visible in Cloudflare logs)
  console.log(`[TuneForge] ${event}:`, JSON.stringify(logEntry));
  
  // Store in KV for debugging (optional - can create a LOGS namespace)
  // This is useful for tracking issues across sessions
  const logKey = `log:${timestamp}:${event}`;
  // Uncomment if you have a LOGS KV namespace
  // env.LOGS?.put(logKey, JSON.stringify(logEntry), { expirationTtl: 86400 }); // 24 hour expiry
  
  return logEntry;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const binId = url.searchParams.get('binId');
  
  logEvent(env, 'conversation_list_request', {
    binId,
    url: url.pathname,
    headers: Object.fromEntries(request.headers.entries())
  });
  
  if (!binId) {
    logEvent(env, 'conversation_list_error', { error: 'Bin ID required' });
    return new Response(JSON.stringify({ error: 'Bin ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const list = await env.CONVERSATIONS.list({ prefix: `${binId}:` });
    const conversations = [];
    
    logEvent(env, 'conversation_list_fetched', {
      binId,
      keyCount: list.keys.length
    });
    
    for (const key of list.keys) {
      const convData = await env.CONVERSATIONS.get(key.name, 'json');
      if (convData) {
        conversations.push({
          id: key.name.split(':')[1],
          ...convData
        });
        
        logEvent(env, 'conversation_loaded', {
          conversationId: key.name.split(':')[1],
          name: convData.name,
          messageCount: convData.messages?.length || 0,
          turnCount: convData.metadata?.turnCount || 0
        });
      }
    }
    
    logEvent(env, 'conversation_list_success', {
      binId,
      conversationCount: conversations.length
    });
    
    return new Response(JSON.stringify({ conversations }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logEvent(env, 'conversation_list_error', {
      binId,
      error: error.message,
      stack: error.stack
    });
    
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  logEvent(env, 'conversation_create_request', {
    url: request.url,
    method: 'POST'
  });
  
  try {
    const { binId, name, description, messages, metadata } = await request.json();
    
    logEvent(env, 'conversation_create_data', {
      binId,
      name,
      messageCount: messages?.length || 0,
      hasMetadata: !!metadata
    });
    
    if (!binId || !messages || !Array.isArray(messages)) {
      logEvent(env, 'conversation_create_error', { 
        error: 'Invalid conversation data',
        hasBinId: !!binId,
        hasMessages: !!messages,
        isMessagesArray: Array.isArray(messages)
      });
      return new Response(JSON.stringify({ error: 'Invalid conversation data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate conversation ID
    const convId = crypto.randomUUID();
    const key = `${binId}:${convId}`;
    
    const conversationData = {
      name: name || 'Untitled Conversation',
      description: description || '',
      messages,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        turnCount: messages.filter(m => m.role === 'user').length
      }
    };
    
    logEvent(env, 'conversation_create_saving', {
      conversationId: convId,
      key,
      name: conversationData.name,
      messageCount: messages.length,
      turnCount: conversationData.metadata.turnCount
    });
    
    await env.CONVERSATIONS.put(key, JSON.stringify(conversationData));
    
    logEvent(env, 'conversation_create_saved', {
      conversationId: convId,
      binId
    });
    
    // Update bin conversation count
    const binData = await env.BINS.get(binId, 'json');
    if (binData) {
      const oldCount = binData.conversationCount || 0;
      binData.conversationCount = oldCount + 1;
      binData.lastUpdated = new Date().toISOString();
      await env.BINS.put(binId, JSON.stringify(binData));
      
      logEvent(env, 'bin_count_updated', {
        binId,
        oldCount,
        newCount: binData.conversationCount
      });
    }
    
    logEvent(env, 'conversation_create_success', {
      conversationId: convId,
      binId,
      name: conversationData.name
    });
    
    return new Response(JSON.stringify({ id: convId, ...conversationData }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logEvent(env, 'conversation_create_error', {
      error: error.message,
      stack: error.stack
    });
    
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const convId = pathParts.pop();
  
  logEvent(env, 'conversation_update_request', {
    conversationId: convId,
    url: request.url,
    method: 'PUT'
  });
  
  try {
    const { binId, name, description, messages, metadata } = await request.json();
    
    logEvent(env, 'conversation_update_data', {
      conversationId: convId,
      binId,
      name,
      messageCount: messages?.length || 0,
      hasMetadata: !!metadata
    });
    
    if (!convId || !binId || !messages || !Array.isArray(messages)) {
      logEvent(env, 'conversation_update_error', { 
        error: 'Invalid conversation data',
        hasConvId: !!convId,
        hasBinId: !!binId,
        hasMessages: !!messages,
        isMessagesArray: Array.isArray(messages)
      });
      return new Response(JSON.stringify({ error: 'Invalid conversation data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const key = `${binId}:${convId}`;
    
    // Check if conversation exists
    const existing = await env.CONVERSATIONS.get(key, 'json');
    if (!existing) {
      logEvent(env, 'conversation_update_not_found', {
        conversationId: convId,
        binId,
        key
      });
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    logEvent(env, 'conversation_update_existing', {
      conversationId: convId,
      existingName: existing.name,
      existingMessageCount: existing.messages?.length || 0,
      existingTurnCount: existing.metadata?.turnCount || 0
    });
    
    // Update conversation data
    const conversationData = {
      name: name || existing.name || 'Untitled Conversation',
      description: description !== undefined ? description : existing.description,
      messages,
      metadata: {
        ...existing.metadata,
        ...metadata,
        updatedAt: new Date().toISOString(),
        turnCount: messages.filter(m => m.role === 'user').length
      }
    };
    
    logEvent(env, 'conversation_update_saving', {
      conversationId: convId,
      key,
      name: conversationData.name,
      messageCount: messages.length,
      turnCount: conversationData.metadata.turnCount,
      previousTurnCount: existing.metadata?.turnCount || 0
    });
    
    await env.CONVERSATIONS.put(key, JSON.stringify(conversationData));
    
    logEvent(env, 'conversation_update_success', {
      conversationId: convId,
      binId,
      name: conversationData.name,
      turnCount: conversationData.metadata.turnCount
    });
    
    return new Response(JSON.stringify({ id: convId, ...conversationData }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logEvent(env, 'conversation_update_error', {
      conversationId: convId,
      error: error.message,
      stack: error.stack
    });
    
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