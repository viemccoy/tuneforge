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
  
  // Get session from cookie
  const cookie = request.headers.get('Cookie');
  const sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
  
  if (!sessionToken) {
    return new Response(JSON.stringify({ 
      error: "Authentication required",
      code: "NO_SESSION"
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Verify session (no expiry check needed)
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