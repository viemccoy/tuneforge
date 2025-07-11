// Deep scan to find ALL bins and conversations in KV
export async function onRequestGet(context) {
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
      error: 'Access denied. Only vie@morpheus.systems can use deep scan.' 
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const results = {
      user: {
        email: user.email,
        teamId: user.teamId,
        role: user.role
      },
      bins: {
        all: [],
        byFormat: {
          newFormat: [],  // bin:team:id
          oldFormat: [],  // just id
          other: []
        },
        byName: {}
      },
      conversations: {
        all: [],
        byBinId: {},
        orphaned: []
      },
      stats: {
        totalBins: 0,
        totalConversations: 0,
        orphanedConversations: 0
      }
    };
    
    // 1. Scan ALL bins with pagination
    let binCursor = null;
    do {
      const binList = await env.BINS.list({ 
        limit: 100,
        cursor: binCursor 
      });
      
      for (const key of binList.keys) {
        const bin = await env.BINS.get(key.name, 'json');
        if (bin) {
          results.stats.totalBins++;
          
          // Store bin info
          const binInfo = {
            key: key.name,
            id: bin.id,
            name: bin.name,
            teamId: bin.teamId,
            conversationCount: bin.conversationCount || 0,
            createdAt: bin.createdAt,
            createdBy: bin.createdBy
          };
          
          results.bins.all.push(binInfo);
          results.bins.byName[bin.name] = binInfo;
          
          // Categorize by format
          if (key.name.startsWith('bin:') && key.name.split(':').length === 3) {
            results.bins.byFormat.newFormat.push(binInfo);
          } else if (!key.name.includes(':')) {
            results.bins.byFormat.oldFormat.push(binInfo);
          } else {
            results.bins.byFormat.other.push(binInfo);
          }
        }
      }
      
      binCursor = binList.cursor;
    } while (binCursor);
    
    // 2. Scan ALL conversations with pagination
    let convCursor = null;
    do {
      const convList = await env.CONVERSATIONS.list({ 
        limit: 100,
        cursor: convCursor 
      });
      
      for (const key of convList.keys) {
        const conv = await env.CONVERSATIONS.get(key.name, 'json');
        if (conv) {
          results.stats.totalConversations++;
          
          const convInfo = {
            key: key.name,
            id: conv.id,
            name: conv.name || 'Untitled',
            binId: conv.binId,
            messageCount: conv.messages?.length || 0,
            createdAt: conv.metadata?.createdAt || conv.createdAt
          };
          
          results.conversations.all.push(convInfo);
          
          // Group by binId
          if (conv.binId) {
            if (!results.conversations.byBinId[conv.binId]) {
              results.conversations.byBinId[conv.binId] = [];
            }
            results.conversations.byBinId[conv.binId].push(convInfo);
            
            // Check if bin exists
            let binFound = false;
            for (const bin of results.bins.all) {
              if (bin.id === conv.binId) {
                binFound = true;
                break;
              }
            }
            
            if (!binFound) {
              results.conversations.orphaned.push(convInfo);
              results.stats.orphanedConversations++;
            }
          } else {
            results.conversations.orphaned.push(convInfo);
            results.stats.orphanedConversations++;
          }
        }
      }
      
      convCursor = convList.cursor;
    } while (convCursor);
    
    // 3. Find missing bins by name
    const expectedBins = [
      'Michael\'s Original Prompt',
      'Morpheus Superprompt 2',
      'jess test bin',
      'Ethereality Prompt'
    ];
    
    results.missingBins = expectedBins.filter(name => !results.bins.byName[name]);
    
    // 4. Generate migration suggestions
    results.suggestions = [];
    
    // Check for bins that need team assignment
    for (const bin of results.bins.all) {
      if (!bin.teamId || bin.teamId !== 'morpheus-systems') {
        results.suggestions.push({
          type: 'UPDATE_BIN_TEAM',
          bin: bin.name,
          action: `Update bin "${bin.name}" to have teamId: morpheus-systems`
        });
      }
    }
    
    // Check for conversations in Ethereality Prompt
    const etherealityBin = results.bins.byName['Ethereality Prompt'];
    if (etherealityBin) {
      const etherealityConvs = results.conversations.byBinId[etherealityBin.id] || [];
      if (etherealityConvs.length === 0 && etherealityBin.conversationCount > 0) {
        results.suggestions.push({
          type: 'FIX_CONVERSATIONS',
          bin: 'Ethereality Prompt',
          action: `Find ${etherealityBin.conversationCount} missing conversations for Ethereality Prompt`
        });
      }
    }
    
    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Deep scan error:', error);
    return new Response(JSON.stringify({ 
      error: 'Deep scan failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}