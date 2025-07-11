// Diagnose conversation loading issues
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const binId = url.searchParams.get('binId');
  
  // Auth check
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
  
  try {
    const results = {
      binId,
      conversations: {
        byKeyPrefix: [],
        byBinId: [],
        all: []
      },
      analysis: {}
    };
    
    // Get all conversations
    const convList = await env.CONVERSATIONS.list({ limit: 1000 });
    
    for (const key of convList.keys) {
      const conv = await env.CONVERSATIONS.get(key.name, 'json');
      if (conv) {
        const convInfo = {
          key: key.name,
          id: conv.id,
          name: conv.name || 'Untitled',
          binId: conv.binId,
          messageCount: conv.messages?.length || 0
        };
        
        results.conversations.all.push(convInfo);
        
        // Check if this conversation belongs to the requested bin
        if (binId) {
          // Method 1: Check by binId field
          if (conv.binId === binId) {
            results.conversations.byBinId.push(convInfo);
          }
          
          // Method 2: Check by key prefix
          if (key.name.startsWith(binId + ':')) {
            results.conversations.byKeyPrefix.push(convInfo);
          }
        }
      }
    }
    
    // Analyze why conversations might not be loading
    if (binId) {
      results.analysis.binId = binId;
      results.analysis.foundByBinId = results.conversations.byBinId.length;
      results.analysis.foundByKeyPrefix = results.conversations.byKeyPrefix.length;
      
      // Check what the frontend might be looking for
      const possibleKeys = [
        `${binId}:*`,  // Original format
        `conversation:${binId}:*`,  // Prefixed format
        `bin:morpheus-systems:${binId}:*`  // Full format
      ];
      
      results.analysis.possibleKeyFormats = possibleKeys;
      
      // Check if bin exists
      const binKeys = [
        `bin:morpheus-systems:${binId}`,
        `bin:${binId}`,
        binId
      ];
      
      for (const key of binKeys) {
        const bin = await env.BINS.get(key, 'json');
        if (bin) {
          results.analysis.binFound = {
            key,
            bin: {
              id: bin.id,
              name: bin.name,
              conversationCount: bin.conversationCount
            }
          };
          break;
        }
      }
    }
    
    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Diagnose error:', error);
    return new Response(JSON.stringify({ 
      error: 'Diagnosis failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}