// Debug script to find out why bins disappeared
// Run this in the browser console while logged in as vie@morpheus.systems

async function debugBinsIssue() {
  console.log('=== DEBUGGING BINS ISSUE ===\n');
  
  // Get session token
  const token = sessionStorage.getItem('tuneforge_session');
  if (!token) {
    console.error('No session token found. Please log in first.');
    return;
  }
  
  console.log('Session token found:', token);
  
  // 1. Check debug-bins endpoint to see ALL bins in KV
  console.log('\n1. Checking ALL bins in KV (debug-bins)...');
  try {
    const debugResponse = await fetch('/api/debug-bins', {
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      }
    });
    
    if (!debugResponse.ok) {
      console.error('Debug endpoint failed:', debugResponse.status);
      const error = await debugResponse.text();
      console.error('Error:', error);
    } else {
      const debugData = await debugResponse.json();
      console.log('Debug data:', debugData);
      console.log(`Total bins in KV: ${debugData.binCount}`);
      console.log(`User: ${debugData.user}`);
      console.log(`Team: ${debugData.team}`);
      
      // Analyze key formats
      console.log('\nKey format analysis:');
      const keyFormats = {};
      debugData.keyFormats.forEach(info => {
        keyFormats[info.format] = (keyFormats[info.format] || 0) + 1;
      });
      console.log('Key formats:', keyFormats);
      
      // Show all bins with their keys and teamIds
      console.log('\nAll bins:');
      debugData.bins.forEach(item => {
        console.log(`- Key: ${item.key}`);
        console.log(`  Bin ID: ${item.bin.id}`);
        console.log(`  Name: ${item.bin.name}`);
        console.log(`  TeamId: ${item.bin.teamId || 'NO TEAM'}`);
        console.log(`  CreatedBy: ${item.bin.createdBy || 'UNKNOWN'}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('Debug request error:', error);
  }
  
  // 2. Check bins-fixed endpoint to see what user can access
  console.log('\n2. Checking user-accessible bins (bins-fixed)...');
  try {
    const binsResponse = await fetch('/api/bins-fixed', {
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      }
    });
    
    if (!binsResponse.ok) {
      console.error('Bins-fixed endpoint failed:', binsResponse.status);
      const error = await binsResponse.text();
      console.error('Error:', error);
    } else {
      const binsData = await binsResponse.json();
      console.log('Bins data:', binsData);
      console.log(`User can access ${binsData.bins.length} bins`);
      console.log(`User teamId: ${binsData.teamId}`);
      
      if (binsData.bins.length > 0) {
        console.log('\nAccessible bins:');
        binsData.bins.forEach(bin => {
          console.log(`- ${bin.name} (ID: ${bin.id}, TeamId: ${bin.teamId})`);
        });
      }
    }
  } catch (error) {
    console.error('Bins request error:', error);
  }
  
  // 3. Check if user object exists and has correct teamId
  console.log('\n3. Checking user info...');
  try {
    const sessionResponse = await fetch('/api/session-test', {
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      }
    });
    
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      console.log('Session test data:', sessionData);
    }
  } catch (error) {
    console.error('Session test error:', error);
  }
  
  console.log('\n=== END DEBUG ===');
}

// Run the debug function
debugBinsIssue();