// Bin settings endpoint for managing visibility and other settings
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
    
    // Get bin
    let bin = await env.BINS.get(`bin:${user.teamId}:${binId}`, 'json');
    if (!bin) {
      bin = await env.BINS.get(binId, 'json');
    }
    
    if (!bin) {
      return new Response(JSON.stringify({ error: 'Bin not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if user has permission to view settings
    if (bin.teamId !== user.teamId && bin.createdBy !== user.email) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Return settings
    const settings = {
      visibility: bin.visibility || 'team', // Default to team visibility
      createdBy: bin.createdBy,
      teamId: bin.teamId,
      canEdit: bin.createdBy === user.email || user.role === 'admin'
    };
    
    return new Response(JSON.stringify(settings), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in bin-settings GET:', error);
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
    const updates = await request.json();
    
    if (!binId) {
      return new Response(JSON.stringify({ error: 'Bin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get bin
    const binKey = `bin:${user.teamId}:${binId}`;
    let bin = await env.BINS.get(binKey, 'json');
    
    if (!bin) {
      // Try old format
      bin = await env.BINS.get(binId, 'json');
      if (bin && bin.teamId === user.teamId) {
        // Migrate to new key format
        await env.BINS.delete(binId);
      } else {
        return new Response(JSON.stringify({ error: 'Bin not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Check permissions - only bin creator or admin can edit settings
    if (bin.createdBy !== user.email && user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only the bin creator can edit settings' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Validate visibility setting
    if (updates.visibility && !['personal', 'team'].includes(updates.visibility)) {
      return new Response(JSON.stringify({ error: 'Invalid visibility setting. Must be "personal" or "team"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Update bin settings
    if (updates.visibility !== undefined) {
      bin.visibility = updates.visibility;
    }
    
    // Add other settings here as needed
    bin.lastUpdated = new Date().toISOString();
    bin.lastUpdatedBy = user.email;
    
    // Save bin
    await env.BINS.put(binKey, JSON.stringify(bin));
    
    return new Response(JSON.stringify({ 
      success: true,
      visibility: bin.visibility,
      message: 'Settings updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in bin-settings PUT:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}