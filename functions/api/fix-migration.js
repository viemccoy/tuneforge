// Fix migration issues - assign IDs to bins without them and find missing bins
export async function onRequestPost(context) {
  const { request, env } = context;
  
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
  
  const user = await env.USERS.get(`user:${session.email}`, 'json');
  if (!user || user.email !== 'vie@morpheus.systems') {
    return new Response(JSON.stringify({ 
      error: 'Access denied. Only vie@morpheus.systems can run fix.' 
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const results = {
      fixed: [],
      errors: [],
      stats: {
        binsChecked: 0,
        binsFixed: 0,
        conversationsFound: 0,
        conversationsMigrated: 0
      }
    };
    
    // 1. List all bins to find ones with undefined IDs
    const binList = await env.BINS.list({ limit: 100 });
    
    for (const key of binList.keys) {
      results.stats.binsChecked++;
      
      // Check for bins with undefined in the key
      if (key.name.includes(':undefined')) {
        const bin = await env.BINS.get(key.name, 'json');
        
        if (bin) {
          // Generate a new ID if missing
          if (!bin.id) {
            bin.id = crypto.randomUUID();
            results.fixed.push(`Generated ID ${bin.id} for bin "${bin.name}"`);
          }
          
          // Ensure team assignment
          if (!bin.teamId) {
            bin.teamId = 'morpheus-systems';
          }
          
          // Save with proper key
          const newKey = `bin:${bin.teamId}:${bin.id}`;
          await env.BINS.put(newKey, JSON.stringify(bin));
          
          // Delete old key
          await env.BINS.delete(key.name);
          
          results.stats.binsFixed++;
          results.fixed.push(`Fixed bin "${bin.name}" - moved from ${key.name} to ${newKey}`);
        }
      }
    }
    
    // 2. Search for orphaned conversations (conversations without valid bin reference)
    const convList = await env.CONVERSATIONS.list({ limit: 1000 });
    const orphanedConversations = [];
    
    for (const key of convList.keys) {
      const conv = await env.CONVERSATIONS.get(key.name, 'json');
      if (conv) {
        results.stats.conversationsFound++;
        
        // Check if bin exists
        if (conv.binId) {
          // Try multiple key formats
          const binKeys = [
            `bin:morpheus-systems:${conv.binId}`,
            `bin:${conv.binId}`,
            conv.binId
          ];
          
          let binFound = false;
          for (const binKey of binKeys) {
            const bin = await env.BINS.get(binKey, 'json');
            if (bin) {
              binFound = true;
              break;
            }
          }
          
          if (!binFound) {
            orphanedConversations.push({
              id: conv.id,
              name: conv.name,
              binId: conv.binId,
              key: key.name
            });
          }
        }
      }
    }
    
    results.orphanedConversations = orphanedConversations;
    
    // 3. Look for bins that might not have the team prefix
    const possibleBinNames = [
      'Michael\'s Original Prompt',
      'Morpheus Superprompt 2',
      'jess test bin',
      'Ethereality Prompt'
    ];
    
    const foundBins = [];
    for (const name of possibleBinNames) {
      // Search by iterating through all bins
      const allBins = await env.BINS.list({ limit: 100 });
      for (const key of allBins.keys) {
        const bin = await env.BINS.get(key.name, 'json');
        if (bin && bin.name === name) {
          foundBins.push({
            key: key.name,
            bin: bin
          });
        }
      }
    }
    
    results.foundBins = foundBins;
    
    // 4. Fix orphaned conversations by re-linking them
    if (orphanedConversations.length > 0) {
      results.conversationFixes = [];
      
      // Try to match orphaned conversations to fixed bins
      for (const orphan of orphanedConversations) {
        // Look for a bin that might match
        const fixedBinList = await env.BINS.list({ limit: 100 });
        let matchedBin = null;
        
        for (const key of fixedBinList.keys) {
          const bin = await env.BINS.get(key.name, 'json');
          if (bin && (bin.id === orphan.binId || bin.name === orphan.binName)) {
            matchedBin = { key: key.name, bin: bin };
            break;
          }
        }
        
        if (matchedBin) {
          // Update conversation with correct bin ID
          const conv = await env.CONVERSATIONS.get(orphan.key, 'json');
          if (conv) {
            conv.binId = matchedBin.bin.id;
            await env.CONVERSATIONS.put(orphan.key, JSON.stringify(conv));
            results.conversationFixes.push({
              conversation: orphan.name,
              oldBinId: orphan.binId,
              newBinId: matchedBin.bin.id,
              binName: matchedBin.bin.name
            });
            results.stats.conversationsMigrated++;
          }
        }
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Fixed ${results.stats.binsFixed} bins. Found ${orphanedConversations.length} orphaned conversations.`,
      results: results
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fix migration error:', error);
    return new Response(JSON.stringify({ 
      error: 'Fix failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}