// Console test to check session handling
// Run this in the browser console after logging in

async function testSession() {
  const sessionToken = sessionStorage.getItem('tuneforge_session');
  console.log('=== Session Test ===');
  console.log('Token from storage:', sessionToken);
  
  // Test the session-test endpoint
  console.log('\nTesting session-test endpoint...');
  const testResponse = await fetch('/api/session-test', {
    headers: {
      'X-Session-Token': sessionToken
    }
  });
  const testData = await testResponse.json();
  console.log('Session test response:', testData);
  
  // Test bins with same headers
  console.log('\nTesting bins endpoint...');
  const binsResponse = await fetch('/api/bins', {
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': sessionToken
    },
    credentials: 'include'
  });
  console.log('Bins response status:', binsResponse.status);
  if (binsResponse.status !== 200) {
    const error = await binsResponse.json();
    console.log('Bins error:', error);
  }
}

testSession();