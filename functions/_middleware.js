// Root middleware for Cloudflare Pages Functions
const PUBLIC_PATHS = [
  '/api/auth',
  '/api/users', 
  '/api/test',
  '/api/auth-test',
  '/api/session-test',
  '/login.html',
  '/login.js',
  '/style.css',
  '/style-ultimate.css',
  '/style-loom.css',
  '/style-bins.css',
  '/index.html',
  '/',
  '/app-ultimate.js',
  '/loom.js'
];

// Export for all HTTP methods
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  
  console.log('[Root Middleware] Request:', request.method, url.pathname);
  
  // Allow public paths
  if (PUBLIC_PATHS.some(path => url.pathname.startsWith(path))) {
    console.log('[Root Middleware] Public path, skipping auth');
    return next();
  }
  
  // Check authentication for all other routes (including root /)
  // Skip auth check only for static assets
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    return next();
  }
  
  // DISABLED: Server-side HTML auth check
  // The app uses sessionStorage for auth which isn't sent to server
  // Client-side JavaScript handles authentication
  /*
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    if (url.pathname === '/login.html') {
      return next();
    }
    // ... auth check disabled ...
  }
  */
  
  // For API routes, continue with existing logic
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }
  
  // Get session token
  let sessionToken = request.headers.get('X-Session-Token');
  if (!sessionToken) {
    const cookie = request.headers.get('Cookie');
    sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
  }
  
  console.log('[Root Middleware] Session token:', sessionToken ? 'found' : 'not found');
  
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
  
  // Set user in context
  context.user = user;
  context.session = session;
  
  console.log('[Root Middleware] Auth successful for:', user.email);
  
  return next();
}

// Also export individual methods
export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestPut = onRequest;
export const onRequestDelete = onRequest;
export const onRequestPatch = onRequest;
export const onRequestHead = onRequest;
export const onRequestOptions = onRequest;