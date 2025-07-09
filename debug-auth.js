// Direct auth debug - paste this in browser console after logging in

async function debugAuth() {
  const token = sessionStorage.getItem('tuneforge_session');
  console.log('=== Direct Auth Debug ===');
  console.log('Session token:', token);
  
  if (!token) {
    console.log('No session token found!');
    return;
  }
  
  // Direct bins request with minimal headers
  console.log('\n1. Testing bins with X-Session-Token...');
  const response1 = await fetch('/api/bins', {
    headers: {
      'X-Session-Token': token
    }
  });
  
  console.log('Response status:', response1.status);
  console.log('Response headers:', Object.fromEntries(response1.headers.entries()));
  
  if (response1.status !== 200) {
    const error = await response1.json();
    console.log('Error response:', error);
  } else {
    const data = await response1.json();
    console.log('Success! Bins:', data);
  }
  
  // Also try with Content-Type
  console.log('\n2. Testing bins with Content-Type + X-Session-Token...');
  const response2 = await fetch('/api/bins', {
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': token
    }
  });
  
  console.log('Response status:', response2.status);
  if (response2.status !== 200) {
    const error = await response2.json();
    console.log('Error response:', error);
  }
  
  // Try without any session (should definitely fail)
  console.log('\n3. Testing bins without session (should fail)...');
  const response3 = await fetch('/api/bins', {
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  console.log('Response status:', response3.status);
  const error3 = await response3.json();
  console.log('Error response:', error3);
}

debugAuth();