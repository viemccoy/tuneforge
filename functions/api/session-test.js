// Test endpoint to debug session handling
export async function onRequestGet(context) {
  const { request, env } = context;
  
  // Log all headers
  console.log('[Session Test] All headers:');
  for (const [key, value] of request.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }
  
  // Check cookie
  const cookie = request.headers.get('Cookie');
  const cookieToken = cookie?.match(/session=([^;]+)/)?.[1];
  console.log('[Session Test] Cookie token:', cookieToken);
  
  // Check header
  const headerToken = request.headers.get('X-Session-Token');
  console.log('[Session Test] Header token:', headerToken);
  
  // Try to get session from KV
  const token = headerToken || cookieToken;
  if (token) {
    const session = await env.SESSIONS.get(`session:${token}`, 'json');
    console.log('[Session Test] Session found:', session ? 'yes' : 'no');
    if (session) {
      console.log('[Session Test] Session userId:', session.userId);
      const user = await env.USERS.get(`user:${session.userId}`, 'json');
      console.log('[Session Test] User found:', user ? 'yes' : 'no');
      if (user) {
        console.log('[Session Test] User email:', user.email);
      }
    }
  }
  
  return new Response(JSON.stringify({
    hasContext: !!context,
    hasUser: !!context.data?.user,
    user: context.data?.user?.email || null,
    cookieToken,
    headerToken,
    tokenUsed: token
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}