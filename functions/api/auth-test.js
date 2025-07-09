// Simple auth test endpoint to debug the issue
export async function onRequestGet(context) {
  const { request, env } = context;
  
  console.log('[AuthTest] Full context:', JSON.stringify({
    contextKeys: Object.keys(context),
    hasUser: !!context.user,
    hasData: !!context.data,
    hasDataUser: !!context.data?.user,
    hasRequest: !!context.request,
    hasEnv: !!context.env
  }));
  
  // Get session token from header
  const token = request.headers.get('X-Session-Token');
  if (!token) {
    return new Response(JSON.stringify({
      error: 'No X-Session-Token header'
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Direct session lookup
  const session = await env.SESSIONS.get(`session:${token}`, 'json');
  if (!session) {
    return new Response(JSON.stringify({
      error: 'Session not found',
      token: token
    }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Direct user lookup
  const user = await env.USERS.get(`user:${session.email}`, 'json');
  if (!user) {
    return new Response(JSON.stringify({
      error: 'User not found',
      sessionEmail: session.email,
      lookupKey: `user:${session.email}`
    }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    success: true,
    middlewareRan: !!context.user,
    contextUser: context.user?.email || null,
    directLookup: {
      session: session,
      user: user
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}