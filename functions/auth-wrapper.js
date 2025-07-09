// Auth wrapper utility since middleware isn't working
export async function requireAuth(handler) {
  return async function(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // Get session token
    let sessionToken = request.headers.get('X-Session-Token');
    if (!sessionToken) {
      const cookie = request.headers.get('Cookie');
      sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
    }
    
    if (!sessionToken) {
      return new Response(JSON.stringify({ 
        error: "Authentication required",
        code: "NO_SESSION"
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get session from KV
    const session = await env.SESSIONS.get(`session:${sessionToken}`, 'json');
    
    if (!session) {
      return new Response(JSON.stringify({ 
        error: "Invalid session",
        code: "INVALID_SESSION"
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get user
    const user = await env.USERS.get(`user:${session.email}`, 'json');
    
    if (!user) {
      return new Response(JSON.stringify({ 
        error: "User not found",
        code: "USER_NOT_FOUND"
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Add to context
    context.user = user;
    context.session = session;
    
    // Call the actual handler
    return handler(context);
  };
}