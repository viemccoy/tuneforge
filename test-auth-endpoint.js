// Test auth endpoint locally
import fetch from 'node-fetch';

const API_URL = 'http://localhost:8788/api/auth';

async function testAuth() {
    console.log('Testing auth endpoint...');
    
    try {
        // Test 1: Check if endpoint exists
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: 'test@morpheus.systems',
                password: 'test123'
            })
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers.raw());
        
        const data = await response.json();
        console.log('Response body:', JSON.stringify(data, null, 2));
        
    } catch (error) {
        console.error('Error testing auth:', error);
    }
}

testAuth();