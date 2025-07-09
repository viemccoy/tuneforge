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
    const { name, systemPrompt, description = '', defaultTemperature = 0.7 } = data;
    
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
      defaultTemperature,
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

async function handlePut(context) {
  const { request, env, user } = context;
  
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const binId = pathParts[pathParts.length - 1];
    
    if (!binId || binId === 'bins-auth') {
      return new Response(JSON.stringify({ 
        error: 'Bin ID required' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get existing bin
    const binKey = `bin:${user.teamId}:${binId}`;
    const existingBin = await env.BINS.get(binKey, 'json');
    
    if (!existingBin) {
      return new Response(JSON.stringify({ 
        error: 'Bin not found' 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get updates
    const updates = await request.json();
    
    // Update allowed fields
    const updatedBin = {
      ...existingBin,
      lastUpdated: new Date().toISOString()
    };
    
    if (updates.name !== undefined) updatedBin.name = updates.name;
    if (updates.description !== undefined) updatedBin.description = updates.description;
    if (updates.systemPrompt !== undefined) updatedBin.systemPrompt = updates.systemPrompt;
    if (updates.defaultTemperature !== undefined) updatedBin.defaultTemperature = updates.defaultTemperature;
    
    // Save updated bin
    await env.BINS.put(binKey, JSON.stringify(updatedBin));
    
    return new Response(JSON.stringify(updatedBin), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error updating bin:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to update bin' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleDelete(context) {
  const { request, env, user } = context;
  
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const binId = pathParts[pathParts.length - 1];
    
    if (!binId || binId === 'bins-auth') {
      return new Response(JSON.stringify({ 
        error: 'Bin ID required' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const binKey = `bin:${user.teamId}:${binId}`;
    
    // Check if bin exists
    const bin = await env.BINS.get(binKey, 'json');
    if (!bin) {
      return new Response(JSON.stringify({ 
        error: 'Bin not found' 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Delete all conversations in the bin
    if (env.CONVERSATIONS) {
      const { keys } = await env.CONVERSATIONS.list({ prefix: `conv:${user.teamId}:${binId}:` });
      await Promise.all(keys.map(key => env.CONVERSATIONS.delete(key.name)));
    }
    
    // Delete the bin
    await env.BINS.delete(binKey);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error deleting bin:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to delete bin' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Export wrapped handlers
export const onRequestGet = requireAuth(handleGet);
export const onRequestPost = requireAuth(handlePost);
export const onRequestPut = requireAuth(handlePut);
export const onRequestDelete = requireAuth(handleDelete);