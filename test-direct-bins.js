// Direct test to check if bins work after login
// Run this in console after seeing "Session stored:" message

async function testDirectBins() {
  const token = sessionStorage.getItem('tuneforge_session');
  
  if (!token) {
    console.log('No session token found. Please login first.');
    return;
  }
  
  console.log('Testing with session token:', token);
  
  // Test 1: Direct bins request
  console.log('\n=== Test 1: Direct bins request ===');
  try {
    const response = await fetch('/api/bins', {
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', data);
    
    if (response.ok) {
      console.log('SUCCESS! Bins loaded:', data.bins?.length || 0);
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  // Test 2: Auth test endpoint
  console.log('\n=== Test 2: Auth test endpoint ===');
  try {
    const response = await fetch('/api/auth-test', {
      headers: {
        'X-Session-Token': token
      }
    });
    
    const data = await response.json();
    console.log('Auth test result:', data);
    console.log('Middleware ran?', data.middlewareRan);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Also test creating a bin if auth works
async function testCreateBin() {
  const token = sessionStorage.getItem('tuneforge_session');
  
  console.log('\n=== Test 3: Create bin ===');
  try {
    const response = await fetch('/api/bins', {
      method: 'POST',
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Bin ' + new Date().toISOString(),
        systemPrompt: 'You are a helpful assistant.',
        description: 'Test bin created via console'
      })
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', data);
    
    if (response.ok) {
      console.log('SUCCESS! Bin created with ID:', data.id);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

console.log('Run testDirectBins() after logging in');
console.log('If bins work, run testCreateBin() to test bin creation');