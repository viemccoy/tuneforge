// Quick fix script to restore bins
// Run this in the browser console after logging in

async function fixBins() {
    const token = sessionStorage.getItem('tuneforge_session');
    if (!token) {
        console.error('Not logged in!');
        return;
    }
    
    console.log('🔧 Starting bins fix...');
    
    // Step 1: Run migration to ensure user teamId is correct
    console.log('1. Running migration to fix user teamId...');
    const migrationResp = await fetch('/api/migrate-fixed', {
        method: 'POST',
        headers: { 
            'X-Session-Token': token,
            'Content-Type': 'application/json'
        }
    });
    
    const migrationData = await migrationResp.json();
    console.log('Migration result:', migrationData);
    
    // Step 2: Verify user now has correct teamId
    console.log('\n2. Verifying user setup...');
    const sessionResp = await fetch('/api/session-test', {
        headers: { 'X-Session-Token': token }
    });
    const sessionData = await sessionResp.json();
    console.log('User:', sessionData.user);
    
    // Step 3: Check bins
    console.log('\n3. Checking bins...');
    const binsResp = await fetch('/api/bins-fixed', {
        headers: { 'X-Session-Token': token }
    });
    const binsData = await binsResp.json();
    
    if (binsData.bins && binsData.bins.length > 0) {
        console.log('✅ SUCCESS! Found', binsData.bins.length, 'bins:');
        binsData.bins.forEach(bin => {
            console.log(`  - ${bin.name} (conversations: ${bin.conversationCount})`);
        });
        console.log('\n🎉 Bins restored! Refresh the page to see them.');
    } else {
        console.error('❌ No bins found. Debug info:');
        console.log('User teamId:', sessionData.user?.teamId);
        console.log('Full response:', binsData);
        
        // Try debug endpoint
        console.log('\n4. Checking raw bins in KV...');
        const debugResp = await fetch('/api/debug-bins', {
            headers: { 'X-Session-Token': token }
        });
        if (debugResp.ok) {
            const debugData = await debugResp.json();
            console.log('Raw bins:', debugData.bins);
        }
    }
}

// Run the fix
fixBins().catch(console.error);

// Also expose for manual use
window.fixBins = fixBins;