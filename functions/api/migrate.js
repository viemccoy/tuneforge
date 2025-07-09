// One-time migration script to assign existing bins to vie@morpheus.systems
// This endpoint should be called once after deployment to migrate existing data

export async function onRequestPost(context) {
  const { request, env, user } = context;
  
  console.log('[Migration] User context:', user);
  console.log('[Migration] User email:', user?.email);
  
  // Only allow vie@morpheus.systems to run migration
  if (!user || user.email !== 'vie@morpheus.systems') {
    return new Response(JSON.stringify({ 
      error: 'Access denied. Only vie@morpheus.systems can run migration.',
      debug: {
        hasUser: !!user,
        userEmail: user?.email,
        userId: user?.userId
      }
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
    
    for (const key of list.keys) {
      const bin = await env.BINS.get(key.name, 'json');
      if (bin) {
        if (!bin.teamId) {
          // Migrate this bin
          bin.teamId = 'morpheus-systems';
          bin.createdBy = 'vie@morpheus.systems';
          
          // Preserve existing timestamps
          if (!bin.createdAt) {
            bin.createdAt = new Date().toISOString();
          }
          
          // Add permissions if missing
          if (!bin.permissions) {
            bin.permissions = {
              public: false,
              teamAccess: 'readwrite'
            };
          }
          
          await env.BINS.put(key.name, JSON.stringify(bin));
          
          migrationResults.push({
            binId: key.name,
            binName: bin.name,
            status: 'migrated'
          });
          migratedCount++;
        } else {
          // Already has teamId, skip
          migrationResults.push({
            binId: key.name,
            binName: bin.name,
            teamId: bin.teamId,
            status: 'skipped'
          });
          skippedCount++;
        }
      }
    }
    
    // Ensure the morpheus-systems team exists
    const teamId = 'morpheus-systems';
    const existingTeam = await env.TEAMS.get(`team:${teamId}`, 'json');
    
    if (!existingTeam) {
      const team = {
        id: teamId,
        name: 'morpheus.systems',
        domain: 'morpheus.systems',
        members: ['vie@morpheus.systems', 'michael@morpheus.systems', 'jessica@morpheus.systems'],
        createdAt: new Date().toISOString(),
        settings: {
          allowAutoJoin: true
        }
      };
      
      await env.TEAMS.put(`team:${teamId}`, JSON.stringify(team));
    }
    
    // Ensure vie@morpheus.systems user exists as admin
    const vieUser = await env.USERS.get('user:vie@morpheus.systems', 'json');
    if (!vieUser) {
      const user = {
        id: crypto.randomUUID(),
        email: 'vie@morpheus.systems',
        teamId: 'morpheus-systems',
        role: 'admin',
        isFirstLogin: true,
        createdAt: new Date().toISOString()
      };
      
      await env.USERS.put('user:vie@morpheus.systems', JSON.stringify(user));
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Migration completed',
      migrated: migratedCount,
      skipped: skippedCount,
      total: list.keys.length,
      results: migrationResults
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