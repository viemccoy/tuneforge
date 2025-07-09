// Middleware for session-based authentication

const PUBLIC_PATHS = [
  '/api/auth',
  '/api/users',
  '/api/test'
];

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  
  // Skip auth for public endpoints
  if (PUBLIC_PATHS.includes(url.pathname)) {
    return next();
  }
  
  // Skip auth for static assets
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }
  
  // Get session from header first (preferred) or cookie (fallback)
  let sessionToken = request.headers.get('X-Session-Token');
  
  if (sessionToken) {
    console.log('[Middleware] Session from header:', sessionToken);
  } else {
    // Fallback to cookie if no header
    const cookie = request.headers.get('Cookie');
    console.log('[Middleware] Raw cookie header:', cookie);
    sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
    if (sessionToken) {
      console.log('[Middleware] Session from cookie:', sessionToken);
    }
  }
  
  if (!sessionToken) {
    console.log('[Middleware] No session token found in cookies');
    return new Response(JSON.stringify({ 
      error: "Authentication required",
      code: "NO_SESSION"
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Verify session (no expiry check needed)
  console.log('[Middleware] Looking up session:', `session:${sessionToken}`);
  const session = await env.SESSIONS.get(`session:${sessionToken}`, 'json');
  console.log('[Middleware] Session lookup result:', session ? 'found' : 'not found');
  
  if (!session) {
    return new Response(JSON.stringify({ 
      error: "Invalid session",
      code: "INVALID_SESSION"
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Get user details
  console.log('[Middleware] Session email:', session.email);
  console.log('[Middleware] Session full structure:', JSON.stringify(session));
  const user = await env.USERS.get(`user:${session.email}`, 'json');
  console.log('[Middleware] User lookup result:', user ? 'found' : 'not found');
  if (!user) {
    return new Response(JSON.stringify({ 
      error: "User not found",
      code: "USER_NOT_FOUND",
      debug: {
        sessionEmail: session.email,
        lookupKey: `user:${session.email}`
      }
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Add user to context for use in API endpoints
  // Endpoints expect context.user directly
  context.user = user;
  context.session = session;
  
  // Also add to context.data for backwards compatibility
  context.data = context.data || {};
  context.data.user = user;
  context.data.session = session;
  
  // Log access for monitoring
  console.log(`[Access] ${session.email} -> ${request.method} ${url.pathname}`);
  
  return next();
}