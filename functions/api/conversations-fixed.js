// Conversations endpoint with inline auth - no imports
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
    
    const { user } = auth;
    
    if (!binId) {
      return new Response(JSON.stringify({ error: 'Bin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check bin key format - it might be stored with team prefix
    let bin = await env.BINS.get(`bin:${user.teamId}:${binId}`, 'json');
    
    // If not found, try without team prefix (old format)
    if (!bin) {
      bin = await env.BINS.get(binId, 'json');
    }
    
    // If still not found, scan all bins to find it (recovery mode)
    if (!bin) {
      const { keys } = await env.BINS.list();
      for (const key of keys) {
        const testBin = await env.BINS.get(key.name, 'json');
        if (testBin && testBin.id === binId) {
          bin = testBin;
          console.log(`Found bin ${binId} with key ${key.name}`);
          break;
        }
      }
    }
    
    if (!bin) {
      return new Response(JSON.stringify({ 
        error: 'Bin not found',
        debug: {
          binId,
          userTeam: user.teamId,
          message: 'Bin might have been migrated. Use /api/recover-bins to find it.'
        }
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (bin.teamId && bin.teamId !== user.teamId) {
      return new Response(JSON.stringify({ 
        error: 'Access denied',
        debug: {
          binId,
          userTeam: user.teamId,
          binTeam: bin.teamId
        }
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // List conversations for this bin
    // Method 1: Look for conversations with binId prefix (original format)
    const list = await env.CONVERSATIONS.list({ prefix: `${binId}:` });
    const conversations = [];
    const foundIds = new Set();
    
    for (const key of list.keys) {
      const convData = await env.CONVERSATIONS.get(key.name, 'json');
      if (convData) {
        const convId = key.name.split(':')[1] || convData.id;
        conversations.push({
          id: convId,
          binId: binId,
          ...convData
        });
        foundIds.add(convId);
      }
    }
    
    // Method 2: If we didn't find any (or found few), scan all conversations for binId field
    if (conversations.length < bin.conversationCount) {
      const allList = await env.CONVERSATIONS.list({ limit: 1000 });
      
      for (const key of allList.keys) {
        const convData = await env.CONVERSATIONS.get(key.name, 'json');
        if (convData && convData.binId === binId && !foundIds.has(convData.id)) {
          conversations.push({
            id: convData.id || key.name,
            binId: binId,
            ...convData
          });
        }
      }
    }
    
    return new Response(JSON.stringify({ conversations }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in conversations-fixed GET:', error);
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
    
    const { user } = auth;
    const { binId, name, description, messages, metadata } = await request.json();
    
    if (!binId || !messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid conversation data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check bin access with both key formats
    let bin = await env.BINS.get(`bin:${user.teamId}:${binId}`, 'json');
    if (!bin) {
      bin = await env.BINS.get(binId, 'json');
    }
    
    if (!bin || (bin.teamId && bin.teamId !== user.teamId)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
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
    
    await env.CONVERSATIONS.put(key, JSON.stringify(conversationData));
    
    // Update bin conversation count
    if (bin) {
      bin.conversationCount = (bin.conversationCount || 0) + 1;
      bin.lastUpdated = new Date().toISOString();
      
      // If bin has no team, assign it to user's team (recovery)
      if (!bin.teamId) {
        bin.teamId = user.teamId;
        bin.recoveredAt = new Date().toISOString();
        console.log(`Recovering orphaned bin ${bin.id} for team ${user.teamId}`);
      }
      
      // Always save with new key format
      const correctKey = `bin:${user.teamId}:${binId}`;
      await env.BINS.put(correctKey, JSON.stringify(bin));
      
      // Clean up old key if it exists
      if (!bin.teamId) {
        await env.BINS.delete(binId);
      }
    }
    
    return new Response(JSON.stringify({ 
      id: convId, 
      binId: binId,
      ...conversationData 
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in conversations-fixed POST:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const convId = url.searchParams.get('id');
  
  try {
    // Authenticate
    const auth = await authenticate(request, env);
    if (auth.error) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { user } = auth;
    const { binId, name, description, messages, metadata } = await request.json();
    
    if (!convId || !binId || !messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid conversation data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const key = `${binId}:${convId}`;
    
    // Check if conversation exists
    const existing = await env.CONVERSATIONS.get(key, 'json');
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
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
    
    await env.CONVERSATIONS.put(key, JSON.stringify(conversationData));
    
    return new Response(JSON.stringify({ 
      id: convId,
      binId: binId,
      ...conversationData 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in conversations-fixed PUT:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const convId = url.searchParams.get('id');
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
    
    const { user } = auth;
    
    if (!convId || !binId) {
      return new Response(JSON.stringify({ error: 'Conversation and Bin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const key = `${binId}:${convId}`;
    await env.CONVERSATIONS.delete(key);
    
    // Update bin conversation count
    let bin = await env.BINS.get(`bin:${user.teamId}:${binId}`, 'json');
    if (!bin) {
      bin = await env.BINS.get(binId, 'json');
    }
    
    if (bin && bin.conversationCount > 0) {
      bin.conversationCount--;
      bin.lastUpdated = new Date().toISOString();
      
      if (bin.teamId) {
        await env.BINS.put(`bin:${user.teamId}:${binId}`, JSON.stringify(bin));
      } else {
        await env.BINS.put(binId, JSON.stringify(bin));
      }
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in conversations-fixed DELETE:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}