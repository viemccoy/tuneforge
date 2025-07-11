// Reconstruct bins from orphaned conversations
export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Auth check
  let sessionToken = request.headers.get('X-Session-Token');
  if (!sessionToken) {
    const cookie = request.headers.get('Cookie');
    sessionToken = cookie?.match(/session=([^;]+]/)?.[1];
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
      error: 'Access denied. Only vie@morpheus.systems can reconstruct bins.' 
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const results = {
      analyzed: {},
      created: [],
      updated: [],
      linked: []
    };
    
    // 1. Analyze conversations to find bin patterns
    const convList = await env.CONVERSATIONS.list({ limit: 1000 });
    const binPatterns = {};
    
    for (const key of convList.keys) {
      const conv = await env.CONVERSATIONS.get(key.name, 'json');
      if (conv) {
        // Extract potential bin ID from conversation key
        const keyParts = key.name.split(':');
        const potentialBinId = keyParts[0];
        
        if (!binPatterns[potentialBinId]) {
          binPatterns[potentialBinId] = {
            id: potentialBinId,
            conversations: [],
            totalMessages: 0
          };
        }
        
        binPatterns[potentialBinId].conversations.push({
          key: key.name,
          name: conv.name || 'Untitled',
          messageCount: conv.messages?.length || 0,
          createdAt: conv.metadata?.createdAt || conv.createdAt
        });
        binPatterns[potentialBinId].totalMessages += conv.messages?.length || 0;
      }
    }
    
    results.analyzed = binPatterns;
    
    // 2. Map patterns to bin names based on conversation content and counts
    const binMappings = {
      'e452d57a2f042242': {
        name: 'Ethereality Prompt',
        expectedCount: 3
      },
      '8285f8917a8df68a': {
        name: 'Morpheus Superprompt 2',
        expectedCount: 4
      },
      'bd71ea223c11ca7d': {
        name: 'jess test bin',
        expectedCount: 2
      },
      '0f1b31446f3c5447': {
        name: "Michael's Original Prompt",
        expectedCount: 1
      }
    };
    
    // 3. Create or update bins
    for (const [binId, pattern] of Object.entries(binPatterns)) {
      // Skip if this is already a valid bin
      if (binId === '468239a2-0d95-4a32-a480-f459e24a67f5') {
        // This is the existing "bin" - just link its conversation
        const conv = await env.CONVERSATIONS.get(`${binId}:e0eb8dd0-a5ce-4c73-aa90-3b8ea306fd4f`, 'json');
        if (conv && conv.binId === undefined) {
          conv.binId = binId;
          await env.CONVERSATIONS.put(`${binId}:e0eb8dd0-a5ce-4c73-aa90-3b8ea306fd4f`, JSON.stringify(conv));
          results.linked.push({
            conversation: conv.name,
            linkedTo: 'bin',
            binId: binId
          });
        }
        continue;
      }
      
      const mapping = binMappings[binId];
      if (!mapping) {
        results.analyzed[binId].suggestedName = 'Unknown Bin';
        continue;
      }
      
      // Check if bin already exists
      let binExists = false;
      const existingBins = await env.BINS.list({ limit: 100 });
      
      for (const key of existingBins.keys) {
        const bin = await env.BINS.get(key.name, 'json');
        if (bin && bin.name === mapping.name) {
          binExists = true;
          
          // Update conversation links for existing bin
          for (const conv of pattern.conversations) {
            const convData = await env.CONVERSATIONS.get(conv.key, 'json');
            if (convData) {
              convData.binId = bin.id;
              await env.CONVERSATIONS.put(conv.key, JSON.stringify(convData));
              results.linked.push({
                conversation: conv.name,
                linkedTo: bin.name,
                binId: bin.id
              });
            }
          }
          
          // Update bin conversation count
          bin.conversationCount = pattern.conversations.length;
          await env.BINS.put(key.name, JSON.stringify(bin));
          results.updated.push({
            bin: bin.name,
            conversationCount: pattern.conversations.length
          });
          break;
        }
      }
      
      if (!binExists) {
        // Create new bin
        const newBin = {
          id: binId,
          name: mapping.name,
          teamId: 'morpheus-systems',
          createdBy: 'vie@morpheus.systems',
          createdAt: pattern.conversations[0]?.createdAt || new Date().toISOString(),
          conversationCount: pattern.conversations.length
        };
        
        const binKey = `bin:morpheus-systems:${binId}`;
        await env.BINS.put(binKey, JSON.stringify(newBin));
        results.created.push({
          name: mapping.name,
          id: binId,
          key: binKey,
          conversationCount: pattern.conversations.length
        });
        
        // Link conversations to new bin
        for (const conv of pattern.conversations) {
          const convData = await env.CONVERSATIONS.get(conv.key, 'json');
          if (convData) {
            convData.binId = binId;
            await env.CONVERSATIONS.put(conv.key, JSON.stringify(convData));
            results.linked.push({
              conversation: conv.name,
              linkedTo: mapping.name,
              binId: binId
            });
          }
        }
      }
    }
    
    // 4. Handle branch conversations specially
    const branchKey = 'branch:e452d57a2f042242:0ec95d60-8989-4dee-9798-0040152c882d:c0e87aee-cb83-4dd9-b994-e14fa27b12d1';
    const branchConv = await env.CONVERSATIONS.get(branchKey, 'json');
    if (branchConv && !branchConv.binId) {
      // This is a branch of an Ethereality Prompt conversation
      const etherealBin = await env.BINS.get('bin:morpheus-systems:e452d57a2f042242', 'json');
      if (etherealBin) {
        branchConv.binId = etherealBin.id;
        await env.CONVERSATIONS.put(branchKey, JSON.stringify(branchConv));
        results.linked.push({
          conversation: branchConv.name || 'Branch conversation',
          linkedTo: 'Ethereality Prompt',
          binId: etherealBin.id,
          note: 'Branch conversation'
        });
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Created ${results.created.length} bins, updated ${results.updated.length} bins, linked ${results.linked.length} conversations`,
      results
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Reconstruction error:', error);
    return new Response(JSON.stringify({ 
      error: 'Reconstruction failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}