// Catch-all middleware for all /api/* routes
// Using Cloudflare Pages Functions dynamic routing pattern

const PUBLIC_PATHS = [
  '/api/auth',
  '/api/users',
  '/api/test',
  '/api/session-test'
];

// This will handle ALL HTTP methods
export async function onRequest(context) {
  const { request, env, next, params } = context;
  const url = new URL(request.url);
  
  console.log('[Middleware [[path]]] Processing request:', request.method, url.pathname);
  console.log('[Middleware [[path]]] Params:', params);
  
  // Skip auth for public endpoints
  if (PUBLIC_PATHS.includes(url.pathname)) {
    console.log('[Middleware [[path]]] Skipping auth for public path');
    return next();
  }
  
  // Get session from header first (preferred) or cookie (fallback)
  let sessionToken = request.headers.get('X-Session-Token');
  
  if (sessionToken) {
    console.log('[Middleware [[path]]] Session from header:', sessionToken);
  } else {
    // Fallback to cookie if no header
    const cookie = request.headers.get('Cookie');
    console.log('[Middleware [[path]]] Raw cookie header:', cookie);
    sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
    if (sessionToken) {
      console.log('[Middleware [[path]]] Session from cookie:', sessionToken);
    }
  }
  
  if (!sessionToken) {
    console.log('[Middleware [[path]]] No session token found');
    return new Response(JSON.stringify({ 
      error: "Authentication required",
      code: "NO_SESSION"
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Verify session
  console.log('[Middleware [[path]]] Looking up session:', `session:${sessionToken}`);
  const session = await env.SESSIONS.get(`session:${sessionToken}`, 'json');
  console.log('[Middleware [[path]]] Session lookup result:', session ? 'found' : 'not found');
  
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
  console.log('[Middleware [[path]]] Session email:', session.email);
  const user = await env.USERS.get(`user:${session.email}`, 'json');
  console.log('[Middleware [[path]]] User lookup result:', user ? 'found' : 'not found');
  
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
  
  // Add user to context
  console.log('[Middleware [[path]]] Setting user in context');
  context.user = user;
  context.session = session;
  
  // Also add to context.data for compatibility
  context.data = context.data || {};
  context.data.user = user;
  context.data.session = session;
  
  // Log access
  console.log(`[Access] ${session.email} -> ${request.method} ${url.pathname}`);
  console.log('[Middleware [[path]]] User set, proceeding to endpoint');
  
  return next();
}