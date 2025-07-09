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
  let sessionData = null;
  let userData = null;
  
  if (token) {
    const session = await env.SESSIONS.get(`session:${token}`, 'json');
    console.log('[Session Test] Session found:', session ? 'yes' : 'no');
    
    if (session) {
      sessionData = session;
      console.log('[Session Test] Session structure:', JSON.stringify(session));
      console.log('[Session Test] Session has email?', 'email' in session);
      console.log('[Session Test] Session has userId?', 'userId' in session);
      
      // Try both ways to find user
      if (session.email) {
        const userByEmail = await env.USERS.get(`user:${session.email}`, 'json');
        console.log('[Session Test] User by email found:', userByEmail ? 'yes' : 'no');
        if (userByEmail) {
          userData = userByEmail;
        }
      }
      
      if (!userData && session.userId) {
        const userById = await env.USERS.get(`user:${session.userId}`, 'json');
        console.log('[Session Test] User by ID found:', userById ? 'yes' : 'no');
        if (userById) {
          userData = userById;
        }
      }
    }
  }
  
  return new Response(JSON.stringify({
    hasContext: !!context,
    hasUser: !!context.data?.user,
    user: context.data?.user?.email || null,
    cookieToken,
    headerToken,
    tokenUsed: token,
    sessionData: sessionData,
    userData: userData
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}