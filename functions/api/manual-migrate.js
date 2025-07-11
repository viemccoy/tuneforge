// Manual migration endpoint to create missing bins
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
      error: 'Access denied. Only vie@morpheus.systems can run manual migration.' 
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const body = await request.json();
    const action = body.action;
    const results = { action, success: false };
    
    switch (action) {
      case 'CREATE_MISSING_BINS': {
        // Create the missing bins
        const missingBins = [
          {
            name: "Michael's Original Prompt",
            id: crypto.randomUUID(),
            conversationCount: 0
          },
          {
            name: "Morpheus Superprompt 2",
            id: crypto.randomUUID(),
            conversationCount: 0
          },
          {
            name: "jess test bin",
            id: crypto.randomUUID(),
            conversationCount: 0
          }
        ];
        
        results.created = [];
        
        for (const binData of missingBins) {
          // Check if bin already exists
          const existingBins = await env.BINS.list({ limit: 100 });
          let exists = false;
          
          for (const key of existingBins.keys) {
            const bin = await env.BINS.get(key.name, 'json');
            if (bin && bin.name === binData.name) {
              exists = true;
              results.created.push({ name: binData.name, status: 'already exists', key: key.name });
              break;
            }
          }
          
          if (!exists) {
            const newBin = {
              id: binData.id,
              name: binData.name,
              teamId: 'morpheus-systems',
              createdBy: 'vie@morpheus.systems',
              createdAt: new Date().toISOString(),
              conversationCount: binData.conversationCount
            };
            
            const binKey = `bin:morpheus-systems:${newBin.id}`;
            await env.BINS.put(binKey, JSON.stringify(newBin));
            results.created.push({ name: binData.name, status: 'created', key: binKey, id: newBin.id });
          }
        }
        
        results.success = true;
        break;
      }
      
      case 'FIX_BIN_TEAM': {
        // Fix team assignment for a specific bin
        const { binKey, binId } = body;
        
        if (!binKey) {
          results.error = 'binKey required';
          break;
        }
        
        const bin = await env.BINS.get(binKey, 'json');
        if (!bin) {
          results.error = 'Bin not found';
          break;
        }
        
        // Update bin with correct team
        bin.teamId = 'morpheus-systems';
        
        // Save with new key format
        const newKey = `bin:morpheus-systems:${bin.id || binId}`;
        await env.BINS.put(newKey, JSON.stringify(bin));
        
        // Delete old key if different
        if (binKey !== newKey) {
          await env.BINS.delete(binKey);
        }
        
        results.success = true;
        results.oldKey = binKey;
        results.newKey = newKey;
        results.bin = bin;
        break;
      }
      
      case 'LINK_ORPHANED_CONVERSATIONS': {
        // Try to link orphaned conversations to bins
        const convList = await env.CONVERSATIONS.list({ limit: 1000 });
        const binList = await env.BINS.list({ limit: 100 });
        
        // Build bin lookup
        const binsByName = {};
        const binsById = {};
        
        for (const key of binList.keys) {
          const bin = await env.BINS.get(key.name, 'json');
          if (bin) {
            binsByName[bin.name] = bin;
            binsById[bin.id] = bin;
          }
        }
        
        results.linked = [];
        results.stillOrphaned = [];
        
        for (const key of convList.keys) {
          const conv = await env.CONVERSATIONS.get(key.name, 'json');
          if (conv) {
            // Check if conversation has a valid bin
            let validBin = false;
            if (conv.binId && binsById[conv.binId]) {
              validBin = true;
            }
            
            if (!validBin) {
              // Try to match by conversation content
              let matched = false;
              
              // For Ethereality Prompt conversations
              if (conv.messages && conv.messages.length > 0) {
                const firstMessage = conv.messages[0];
                if (firstMessage && firstMessage.content && 
                    firstMessage.content.toLowerCase().includes('ethereal')) {
                  const etherealBin = binsByName['Ethereality Prompt'];
                  if (etherealBin) {
                    conv.binId = etherealBin.id;
                    await env.CONVERSATIONS.put(key.name, JSON.stringify(conv));
                    results.linked.push({
                      conversation: conv.name || 'Untitled',
                      linkedTo: 'Ethereality Prompt',
                      binId: etherealBin.id
                    });
                    matched = true;
                  }
                }
              }
              
              if (!matched) {
                results.stillOrphaned.push({
                  name: conv.name || 'Untitled',
                  id: conv.id,
                  binId: conv.binId,
                  messageCount: conv.messages?.length || 0
                });
              }
            }
          }
        }
        
        results.success = true;
        break;
      }
      
      case 'FIX_CONVERSATION_COUNT': {
        // Recalculate conversation counts for all bins
        const binList = await env.BINS.list({ limit: 100 });
        const convList = await env.CONVERSATIONS.list({ limit: 1000 });
        
        // Count conversations per bin
        const counts = {};
        for (const key of convList.keys) {
          const conv = await env.CONVERSATIONS.get(key.name, 'json');
          if (conv && conv.binId) {
            counts[conv.binId] = (counts[conv.binId] || 0) + 1;
          }
        }
        
        results.updated = [];
        
        // Update bin counts
        for (const key of binList.keys) {
          const bin = await env.BINS.get(key.name, 'json');
          if (bin) {
            const actualCount = counts[bin.id] || 0;
            if (bin.conversationCount !== actualCount) {
              bin.conversationCount = actualCount;
              await env.BINS.put(key.name, JSON.stringify(bin));
              results.updated.push({
                bin: bin.name,
                oldCount: bin.conversationCount,
                newCount: actualCount
              });
            }
          }
        }
        
        results.success = true;
        break;
      }
      
      default:
        results.error = 'Unknown action';
    }
    
    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Manual migration error:', error);
    return new Response(JSON.stringify({ 
      error: 'Manual migration failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}