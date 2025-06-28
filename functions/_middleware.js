// Authentication middleware for all API routes
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Allow static assets and auth endpoint
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/auth') {
    return context.next();
  }
  
  // Check for authentication
  const authHeader = request.headers.get('Authorization');
  const sessionCookie = getCookie(request, 'tuneforge-session');
  
  if (!authHeader && !sessionCookie) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Validate Basic Auth
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme !== 'Basic') {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const decoded = atob(encoded);
    const [username, password] = decoded.split(':');
    
    if (password !== env.AUTH_PASSWORD) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Set session cookie for future requests
    const response = await context.next();
    response.headers.set('Set-Cookie', `tuneforge-session=${btoa(password)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);
    return response;
  }
  
  // Validate session cookie
  if (sessionCookie) {
    try {
      const password = atob(sessionCookie);
      if (password !== env.AUTH_PASSWORD) {
        return new Response('Unauthorized', { status: 401 });
      }
    } catch (e) {
      return new Response('Unauthorized', { status: 401 });
    }
  }
  
  return context.next();
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) return value;
  }
  return null;
}