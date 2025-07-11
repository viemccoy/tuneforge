// Normalize all key formats to ensure consistency
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
      error: 'Access denied. Only vie@morpheus.systems can normalize keys.' 
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const results = {
      bins: {
        processed: 0,
        normalized: 0,
        errors: []
      },
      conversations: {
        processed: 0,
        normalized: 0,
        errors: []
      }
    };
    
    // Step 1: Normalize bin keys
    const binList = await env.BINS.list({ limit: 1000 });
    
    for (const binKey of binList.keys) {
      results.bins.processed++;
      
      try {
        const bin = await env.BINS.get(binKey.name, 'json');
        if (!bin) continue;
        
        // Ensure bin has required fields
        if (!bin.id) {
          bin.id = binKey.name.split(':').pop(); // Extract ID from key if missing
        }
        
        if (!bin.teamId) {
          bin.teamId = 'morpheus-systems'; // Default team
          bin.normalizedAt = new Date().toISOString();
        }
        
        // Determine correct key format
        const correctKey = `bin:${bin.teamId}:${bin.id}`;
        
        // If key needs to be changed
        if (binKey.name !== correctKey) {
          // Save with new key
          await env.BINS.put(correctKey, JSON.stringify(bin));
          
          // Delete old key
          await env.BINS.delete(binKey.name);
          
          results.bins.normalized++;
          console.log(`Normalized bin key: ${binKey.name} -> ${correctKey}`);
        }
      } catch (error) {
        results.bins.errors.push({
          key: binKey.name,
          error: error.message
        });
      }
    }
    
    // Step 2: Normalize conversation data (ensure binId field is set)
    const convList = await env.CONVERSATIONS.list({ limit: 1000 });
    
    for (const convKey of convList.keys) {
      results.conversations.processed++;
      
      try {
        const conv = await env.CONVERSATIONS.get(convKey.name, 'json');
        if (!conv) continue;
        
        let needsUpdate = false;
        
        // Extract binId from key if not in data
        if (!conv.binId) {
          const keyParts = convKey.name.split(':');
          if (keyParts.length >= 2) {
            conv.binId = keyParts[0];
            needsUpdate = true;
          }
        }
        
        // Ensure conversation has an ID
        if (!conv.id) {
          const keyParts = convKey.name.split(':');
          conv.id = keyParts[keyParts.length - 1] || crypto.randomUUID();
          needsUpdate = true;
        }
        
        // Ensure metadata exists
        if (!conv.metadata) {
          conv.metadata = {};
          needsUpdate = true;
        }
        
        if (!conv.metadata.createdAt) {
          conv.metadata.createdAt = new Date().toISOString();
          needsUpdate = true;
        }
        
        // Update if needed
        if (needsUpdate) {
          conv.normalizedAt = new Date().toISOString();
          await env.CONVERSATIONS.put(convKey.name, JSON.stringify(conv));
          results.conversations.normalized++;
          console.log(`Normalized conversation: ${convKey.name}`);
        }
      } catch (error) {
        results.conversations.errors.push({
          key: convKey.name,
          error: error.message
        });
      }
    }
    
    // Step 3: Final verification - recalculate counts
    const recalcResults = await recalculateAllCounts(env);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Key normalization complete',
      results: results,
      recalculation: recalcResults
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Normalize error:', error);
    return new Response(JSON.stringify({ 
      error: 'Normalization failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper function to recalculate all conversation counts
async function recalculateAllCounts(env) {
  const results = {
    binsUpdated: 0,
    totalConversations: 0
  };
  
  const binList = await env.BINS.list({ limit: 1000 });
  
  for (const binKey of binList.keys) {
    const bin = await env.BINS.get(binKey.name, 'json');
    if (!bin) continue;
    
    // Count conversations
    let count = 0;
    
    // Method 1: By prefix
    const prefixList = await env.CONVERSATIONS.list({ prefix: `${bin.id}:` });
    count += prefixList.keys.length;
    
    // Method 2: By binId field (avoiding duplicates)
    const foundKeys = new Set(prefixList.keys.map(k => k.name));
    const allConvList = await env.CONVERSATIONS.list({ limit: 1000 });
    
    for (const convKey of allConvList.keys) {
      if (foundKeys.has(convKey.name)) continue;
      
      const conv = await env.CONVERSATIONS.get(convKey.name, 'json');
      if (conv && conv.binId === bin.id) {
        count++;
      }
    }
    
    // Update if different
    if (bin.conversationCount !== count) {
      bin.conversationCount = count;
      bin.lastRecalculated = new Date().toISOString();
      await env.BINS.put(binKey.name, JSON.stringify(bin));
      results.binsUpdated++;
    }
    
    results.totalConversations += count;
  }
  
  return results;
}