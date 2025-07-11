// Recalculate conversation counts for all bins
export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Auth check - only vie@morpheus.systems can run this
  let sessionToken = request.headers.get('X-Session-Token');
  if (!sessionToken) {
    const cookie = request.headers.get('Cookie');
    sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
  }
  
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const session = await env.SESSIONS.get(`session:${sessionToken}`, 'json');
  if (!session) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const user = await env.USERS.get(`user:${session.email}`, 'json');
  if (!user || user.email !== 'vie@morpheus.systems') {
    return new Response(JSON.stringify({ 
      error: 'Access denied. Only vie@morpheus.systems can recalculate counts.' 
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const results = {
      bins: [],
      totalBins: 0,
      totalConversations: 0,
      fixes: []
    };
    
    // Get all bins
    const binList = await env.BINS.list({ limit: 1000 });
    
    for (const binKey of binList.keys) {
      const bin = await env.BINS.get(binKey.name, 'json');
      if (!bin) continue;
      
      const binInfo = {
        key: binKey.name,
        id: bin.id,
        name: bin.name,
        oldCount: bin.conversationCount || 0,
        actualCount: 0,
        conversations: []
      };
      
      // Count conversations using both methods
      
      // Method 1: Check by key prefix (original format)
      const prefixList = await env.CONVERSATIONS.list({ prefix: `${bin.id}:` });
      const foundByPrefix = new Set();
      
      for (const convKey of prefixList.keys) {
        const conv = await env.CONVERSATIONS.get(convKey.name, 'json');
        if (conv) {
          binInfo.conversations.push({
            key: convKey.name,
            method: 'prefix',
            name: conv.name || 'Untitled'
          });
          foundByPrefix.add(convKey.name);
          binInfo.actualCount++;
        }
      }
      
      // Method 2: Scan all conversations for binId field
      const allConvList = await env.CONVERSATIONS.list({ limit: 1000 });
      
      for (const convKey of allConvList.keys) {
        // Skip if already found by prefix
        if (foundByPrefix.has(convKey.name)) continue;
        
        const conv = await env.CONVERSATIONS.get(convKey.name, 'json');
        if (conv && conv.binId === bin.id) {
          binInfo.conversations.push({
            key: convKey.name,
            method: 'binId',
            name: conv.name || 'Untitled'
          });
          binInfo.actualCount++;
        }
      }
      
      // Update bin if count is different
      if (binInfo.oldCount !== binInfo.actualCount) {
        bin.conversationCount = binInfo.actualCount;
        bin.lastRecalculated = new Date().toISOString();
        
        // Save with proper key format
        const properKey = bin.teamId ? `bin:${bin.teamId}:${bin.id}` : binKey.name;
        await env.BINS.put(properKey, JSON.stringify(bin));
        
        binInfo.fixed = true;
        results.fixes.push({
          bin: bin.name,
          oldCount: binInfo.oldCount,
          newCount: binInfo.actualCount,
          difference: binInfo.actualCount - binInfo.oldCount
        });
      }
      
      results.bins.push(binInfo);
      results.totalBins++;
      results.totalConversations += binInfo.actualCount;
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Recalculated counts for ${results.totalBins} bins`,
      totalConversations: results.totalConversations,
      fixes: results.fixes,
      details: results.bins
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Recalculate error:', error);
    return new Response(JSON.stringify({ 
      error: 'Recalculation failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}