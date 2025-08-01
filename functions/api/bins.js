// Bin management endpoints with team-based access
import { requireAuth } from '../auth-wrapper.js';

async function handleGet(context) {
  const { request, env, user } = context;
  console.log('[Bins] User authenticated:', user.email);
  
  try {
    // Check if BINS is available
    if (!env?.BINS || typeof env.BINS.list !== 'function') {
      console.error('BINS not found in env:', env);
      return new Response(JSON.stringify({ 
        bins: [],
        error: 'KV namespace not configured',
        debug: {
          hasEnv: !!env,
          envKeys: env ? Object.keys(env) : [],
          hasBINS: !!env?.BINS
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // List all bins for user's team
    const list = await env.BINS.list();
    const bins = [];
    
    for (const key of list.keys) {
      const binData = await env.BINS.get(key.name, 'json');
      if (binData && binData.teamId === user.teamId) {
        bins.push({
          id: key.name,
          ...binData
        });
      }
    }
    
    return new Response(JSON.stringify({ bins }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env, user } = context;
  
  if (!user) {
    return new Response(JSON.stringify({ 
      error: 'Authentication required' 
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const { systemPrompt, name, description } = await request.json();
    
    if (!systemPrompt || !name) {
      return new Response(JSON.stringify({ error: 'System prompt and name are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate bin ID from system prompt hash
    const encoder = new TextEncoder();
    const data = encoder.encode(systemPrompt + Date.now());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const binId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    
    const binData = {
      name,
      description: description || '',
      systemPrompt,
      teamId: user.teamId,
      createdBy: user.email,
      createdAt: new Date().toISOString(),
      conversationCount: 0,
      lastUpdated: new Date().toISOString(),
      permissions: {
        public: false,
        teamAccess: 'readwrite'
      }
    };
    
    // Check if BINS is available
    if (!env.BINS || typeof env.BINS.put !== 'function') {
      throw new Error('KV namespace BINS is not properly bound. Please check your Cloudflare Pages KV namespace bindings.');
    }
    
    await env.BINS.put(binId, JSON.stringify(binData));
    
    return new Response(JSON.stringify({ id: binId, ...binData }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env, user } = context;
  
  if (!user) {
    return new Response(JSON.stringify({ 
      error: 'Authentication required' 
    }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Check if env and BINS are available
  if (!env || !env.BINS) {
    return new Response(JSON.stringify({ error: 'KV namespace BINS is not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const binId = pathParts[pathParts.length - 1];
  
  console.log('DELETE request for bin:', binId);
  
  if (!binId || binId === 'bins') {
    return new Response(JSON.stringify({ error: 'Bin ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Check if bin exists and belongs to user's team
    const binData = await env.BINS.get(binId, 'json');
    if (!binData) {
      return new Response(JSON.stringify({ error: 'Bin not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (binData.teamId !== user.teamId) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Delete all conversations in the bin if CONVERSATIONS namespace exists
    if (env.CONVERSATIONS) {
      const conversationsList = await env.CONVERSATIONS.list({ prefix: `${binId}:` });
      for (const key of conversationsList.keys) {
        await env.CONVERSATIONS.delete(key.name);
      }
    }
    
    // Delete the bin
    await env.BINS.delete(binId);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}