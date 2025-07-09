// Recovery endpoint to find all bins regardless of key format
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
    
    // List ALL bins in the namespace
    const { keys } = await env.BINS.list();
    
    const allBins = [];
    const orphanedBins = [];
    const teamBins = [];
    
    for (const key of keys) {
      const bin = await env.BINS.get(key.name, 'json');
      if (bin) {
        const binInfo = {
          key: key.name,
          bin: bin,
          keyFormat: key.name.startsWith('bin:') ? 'new' : 'old',
          accessible: false
        };
        
        // Check if user has access
        if (bin.teamId === user.teamId) {
          binInfo.accessible = true;
          teamBins.push(binInfo);
        } else if (!bin.teamId) {
          // Old bin without team
          orphanedBins.push(binInfo);
        }
        
        allBins.push(binInfo);
      }
    }
    
    // Find conversations that might reference missing bins
    const { keys: convKeys } = await env.CONVERSATIONS.list();
    const binReferences = new Set();
    
    for (const key of convKeys) {
      // Extract binId from conversation key (format: binId:convId)
      const binId = key.name.split(':')[0];
      if (binId) {
        binReferences.add(binId);
      }
    }
    
    // Find referenced bins that don't exist
    const missingBins = Array.from(binReferences).filter(binId => {
      return !allBins.some(b => b.bin.id === binId);
    });
    
    return new Response(JSON.stringify({ 
      summary: {
        totalBins: allBins.length,
        accessibleBins: teamBins.length,
        orphanedBins: orphanedBins.length,
        missingBinReferences: missingBins.length
      },
      teamBins: teamBins,
      orphanedBins: orphanedBins,
      missingBinReferences: missingBins,
      allBins: allBins
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in recover-bins:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Recovery POST - assign orphaned bins to user's team
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
    const { binIds } = await request.json();
    
    if (!binIds || !Array.isArray(binIds)) {
      return new Response(JSON.stringify({ error: 'binIds array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const recovered = [];
    
    for (const binId of binIds) {
      // Try to find the bin with old key format
      let bin = await env.BINS.get(binId, 'json');
      
      if (bin) {
        // Assign to user's team
        bin.teamId = user.teamId;
        bin.recoveredAt = new Date().toISOString();
        bin.recoveredBy = user.email;
        
        // Save with new key format
        const newKey = `bin:${user.teamId}:${bin.id}`;
        await env.BINS.put(newKey, JSON.stringify(bin));
        
        // Delete old key
        await env.BINS.delete(binId);
        
        recovered.push({
          id: bin.id,
          name: bin.name,
          oldKey: binId,
          newKey: newKey
        });
      }
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      recovered: recovered
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in recover-bins POST:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}