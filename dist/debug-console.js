// TuneForge Authentication Debug Script
// Copy and paste this into the browser console

console.log('=== TuneForge Debug Info ===');

// Check session storage
const sessionToken = sessionStorage.getItem('tuneforge_session');
console.log('1. Session Token:', sessionToken ? `Found (${sessionToken.substring(0, 20)}...)` : 'Not found');

// Check if app instance exists
console.log('2. App Instance:', typeof app !== 'undefined' ? 'Exists' : 'Not found');

// Check authentication state
if (typeof app !== 'undefined') {
    console.log('3. App State:', {
        authenticated: app.authenticated,
        isCloudflare: app.isCloudflare,
        currentUser: app.currentUser,
        apiBase: app.apiBase
    });
}

// Check DOM elements
console.log('4. DOM Elements:', {
    connectionStatus: document.getElementById('connectionStatus')?.textContent,
    connectionDot: document.getElementById('connectionDot')?.className,
    userInfo: document.getElementById('userInfo')?.style.display,
    userEmail: document.getElementById('userEmail')?.textContent,
    appContainer: document.querySelector('.app-container')?.className
});

// Test API endpoints
console.log('5. Testing API endpoints...');

async function testEndpoints() {
    const endpoints = [
        { name: 'Session Test', url: '/api/session-test' },
        { name: 'Bins Fixed', url: '/api/bins-fixed' },
        { name: 'Auth Test', url: '/api/auth-test' }
    ];
    
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint.url, {
                headers: {
                    'X-Session-Token': sessionToken || '',
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json().catch(() => null);
            console.log(`   ${endpoint.name}:`, {
                status: response.status,
                ok: response.ok,
                data: data
            });
        } catch (error) {
            console.log(`   ${endpoint.name}: ERROR -`, error.message);
        }
    }
}

testEndpoints().then(() => {
    console.log('6. Checking console errors...');
    console.log('   Look for any red error messages above this debug output');
    
    console.log('\n7. Quick fixes to try:');
    console.log('   a) Force reload: window.location.reload(true)');
    console.log('   b) Clear session: sessionStorage.removeItem("tuneforge_session")');
    console.log('   c) Manual init: app.initialize()');
    console.log('   d) Manual start: app.startApp()');
    
    console.log('\n=== End Debug Info ===');
});