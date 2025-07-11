// Fix script to ensure vie@morpheus.systems has the correct teamId
// Run this in the browser console while logged in as vie@morpheus.systems

async function fixUserTeamId() {
  console.log('=== FIXING USER TEAMID ===\n');
  
  // Get session token
  const token = sessionStorage.getItem('tuneforge_session');
  if (!token) {
    console.error('No session token found. Please log in first.');
    return;
  }
  
  console.log('Session token found:', token);
  
  // Create a fix endpoint request
  const fixScript = `
    // Get the current user
    const userEmail = 'vie@morpheus.systems';
    const user = await env.USERS.get(\`user:\${userEmail}\`, 'json');
    
    if (!user) {
      return { error: 'User not found' };
    }
    
    console.log('Current user:', user);
    
    // Update the user's teamId if needed
    if (user.teamId !== 'morpheus-systems') {
      user.teamId = 'morpheus-systems';
      await env.USERS.put(\`user:\${userEmail}\`, JSON.stringify(user));
      return { 
        success: true, 
        message: 'User teamId updated',
        oldTeamId: user.teamId,
        newTeamId: 'morpheus-systems',
        user: user
      };
    } else {
      return { 
        success: true, 
        message: 'User already has correct teamId',
        teamId: user.teamId,
        user: user
      };
    }
  `;
  
  // For now, let's just check the debug endpoint to see the user's current state
  try {
    const debugResponse = await fetch('/api/debug-bins', {
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      }
    });
    
    if (debugResponse.ok) {
      const debugData = await debugResponse.json();
      console.log('Current user team:', debugData.team);
      console.log('Current user email:', debugData.user);
      
      if (debugData.team !== 'morpheus-systems') {
        console.error('USER TEAMID MISMATCH DETECTED!');
        console.error('User team is:', debugData.team);
        console.error('But bins are assigned to: morpheus-systems');
        console.error('This is why bins are not showing!');
        
        console.log('\nTo fix this, we need to update the user record in KV.');
        console.log('The migration script needs to also update the user\'s teamId.');
      } else {
        console.log('User teamId is correct:', debugData.team);
      }
    }
  } catch (error) {
    console.error('Debug request error:', error);
  }
  
  console.log('\n=== END FIX CHECK ===');
}

// Run the fix check
fixUserTeamId();