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
  
  // Get session from cookie or header (fallback for Cloudflare Pages cookie issues)
  const cookie = request.headers.get('Cookie');
  console.log('[Middleware] Raw cookie header:', cookie);
  let sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
  
  // If no cookie, check for session in header
  if (!sessionToken) {
    sessionToken = request.headers.get('X-Session-Token');
    console.log('[Middleware] Session from header:', sessionToken);
  } else {
    console.log('[Middleware] Session from cookie:', sessionToken);
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
  
  // Add user context to request for use in API endpoints
  context.user = {
    ...user,
    ...session,
    sessionToken
  };
  
  // Log access for monitoring
  console.log(`[Access] ${session.email} -> ${request.method} ${url.pathname}`);
  
  return next();
}