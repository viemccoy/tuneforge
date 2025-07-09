// Migration endpoint with inline auth
export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Manual auth check
  let sessionToken = request.headers.get('X-Session-Token');
  if (!sessionToken) {
    const cookie = request.headers.get('Cookie');
    sessionToken = cookie?.match(/session=([^;]+)/)?.[1];
  }
  
  if (!sessionToken) {
    return new Response(JSON.stringify({ 
      error: 'Authentication required' 
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Get session and user
  const session = await env.SESSIONS.get(`session:${sessionToken}`, 'json');
  if (!session) {
    return new Response(JSON.stringify({ 
      error: 'Invalid session' 
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const user = await env.USERS.get(`user:${session.email}`, 'json');
  if (!user || user.email !== 'vie@morpheus.systems') {
    return new Response(JSON.stringify({ 
      error: 'Access denied. Only vie@morpheus.systems can run migration.',
      userEmail: user?.email
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Get all bins
    const list = await env.BINS.list();
    let migratedCount = 0;
    let skippedCount = 0;
    const migrationResults = [];
    
    // Create morpheus-systems team if it doesn't exist
    const teamId = 'morpheus-systems';
    let team = await env.TEAMS.get(`team:${teamId}`, 'json');
    
    if (!team) {
      team = {
        id: teamId,
        name: 'Morpheus Systems',
        createdAt: new Date().toISOString(),
        members: ['vie@morpheus.systems', 'michael@morpheus.systems', 'jessica@morpheus.systems']
      };
      await env.TEAMS.put(`team:${teamId}`, JSON.stringify(team));
      migrationResults.push('Created morpheus-systems team');
    }
    
    // Ensure vie@morpheus.systems exists as admin
    const vieEmail = 'vie@morpheus.systems';
    let vieUser = await env.USERS.get(`user:${vieEmail}`, 'json');
    
    if (!vieUser) {
      vieUser = {
        id: crypto.randomUUID(),
        email: vieEmail,
        teamId: teamId,
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      await env.USERS.put(`user:${vieEmail}`, JSON.stringify(vieUser));
      migrationResults.push('Created vie@morpheus.systems user');
    }
    
    // Process each bin
    for (const key of list.keys) {
      const bin = await env.BINS.get(key.name, 'json');
      
      if (bin && !bin.teamId) {
        // This is an old bin without team assignment
        bin.teamId = teamId;
        bin.createdBy = bin.createdBy || vieEmail;
        
        // Store with new key format
        const newKey = `bin:${teamId}:${bin.id}`;
        await env.BINS.put(newKey, JSON.stringify(bin));
        
        // Delete old key if different
        if (key.name !== newKey) {
          await env.BINS.delete(key.name);
        }
        
        migrationResults.push(`Migrated bin: ${bin.name} (${bin.id})`);
        migratedCount++;
      } else {
        skippedCount++;
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Migration complete. Migrated ${migratedCount} bins, skipped ${skippedCount} bins.`,
      results: migrationResults,
      team: team
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ 
      error: 'Migration failed',
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}