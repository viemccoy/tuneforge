// Verification script to check if bins are accessible after migration fix
// Run this in the browser console while logged in as vie@morpheus.systems

async function verifyBinsFix() {
  console.log('=== VERIFYING BINS FIX ===\n');
  
  const token = sessionStorage.getItem('tuneforge_session');
  if (!token) {
    console.error('No session token found. Please log in first.');
    return;
  }
  
  // 1. Run the migration fix
  console.log('1. Running migration fix...');
  try {
    const migrateResponse = await fetch('/api/migrate-fixed', {
      method: 'POST',
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      }
    });
    
    if (!migrateResponse.ok) {
      console.error('Migration failed:', migrateResponse.status);
      const error = await migrateResponse.text();
      console.error('Error:', error);
    } else {
      const migrateData = await migrateResponse.json();
      console.log('Migration result:', migrateData);
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
  
  // 2. Check bins are now accessible
  console.log('\n2. Checking bins access...');
  try {
    const binsResponse = await fetch('/api/bins-fixed', {
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      }
    });
    
    if (!binsResponse.ok) {
      console.error('Bins fetch failed:', binsResponse.status);
      const error = await binsResponse.text();
      console.error('Error:', error);
    } else {
      const binsData = await binsResponse.json();
      console.log(`\n✅ SUCCESS! You can now access ${binsData.bins.length} bins`);
      console.log('Your teamId:', binsData.teamId);
      
      if (binsData.bins.length > 0) {
        console.log('\nAccessible bins:');
        binsData.bins.forEach(bin => {
          console.log(`- ${bin.name} (ID: ${bin.id})`);
        });
      }
    }
  } catch (error) {
    console.error('Bins fetch error:', error);
  }
  
  // 3. Reload the bins in the UI
  console.log('\n3. Reloading bins in UI...');
  if (window.app && typeof window.app.loadBins === 'function') {
    await window.app.loadBins();
    console.log('✅ UI bins reloaded');
  } else {
    console.log('⚠️  Could not find app.loadBins() - you may need to refresh the page');
  }
  
  console.log('\n=== VERIFICATION COMPLETE ===');
}

// Run the verification
verifyBinsFix();