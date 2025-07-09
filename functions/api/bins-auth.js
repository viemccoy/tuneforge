// Bins endpoint with built-in auth since middleware isn't working
import { requireAuth } from '../auth-wrapper.js';

async function handleGet(context) {
  const { request, env, user } = context;
  
  try {
    // List all bins for the user's team
    const { keys } = await env.BINS.list({ prefix: `bin:${user.teamId}:` });
    
    const bins = await Promise.all(
      keys.map(async (key) => {
        const bin = await env.BINS.get(key.name, 'json');
        return bin;
      })
    );
    
    const validBins = bins.filter(bin => bin !== null);
    
    return new Response(JSON.stringify({ 
      bins: validBins,
      teamId: user.teamId 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error loading bins:', error);
    return new Response(JSON.stringify({ 
      bins: [],
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handlePost(context) {
  const { request, env, user } = context;
  
  try {
    const data = await request.json();
    const { name, systemPrompt, description = '' } = data;
    
    if (!name || !systemPrompt) {
      return new Response(JSON.stringify({ 
        error: 'Name and system prompt are required' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const binId = crypto.randomUUID();
    const bin = {
      id: binId,
      teamId: user.teamId,
      name,
      systemPrompt,
      description,
      createdBy: user.email,
      createdAt: new Date().toISOString(),
      conversationCount: 0,
      tokenCount: 0,
      models: []
    };
    
    await env.BINS.put(`bin:${user.teamId}:${binId}`, JSON.stringify(bin));
    
    return new Response(JSON.stringify(bin), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error creating bin:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create bin' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Export wrapped handlers
export const onRequestGet = requireAuth(handleGet);
export const onRequestPost = requireAuth(handlePost);