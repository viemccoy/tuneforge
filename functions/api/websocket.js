// WebSocket endpoint using Durable Objects
export async function onRequestGet(context) {
  const { request, env } = context;
  
  // Upgrade to WebSocket
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }
  
  // Create or get Durable Object instance
  const id = env.WEBSOCKET_DO.idFromName('global-room');
  const durableObject = env.WEBSOCKET_DO.get(id);
  
  // Forward the request to the Durable Object
  return durableObject.fetch(request);
}

// Durable Object class
export class WebSocketDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }
  
  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      
      await this.handleSession(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    return new Response('Not found', { status: 404 });
  }
  
  async handleSession(websocket) {
    websocket.accept();
    
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, websocket);
    
    websocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.handleMessage(sessionId, data);
      } catch (error) {
        websocket.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }
    });
    
    websocket.addEventListener('close', () => {
      this.sessions.delete(sessionId);
    });
    
    // Send connection confirmation
    websocket.send(JSON.stringify({
      type: 'connected',
      sessionId
    }));
  }
  
  async handleMessage(sessionId, data) {
    const websocket = this.sessions.get(sessionId);
    if (!websocket) return;
    
    switch (data.type) {
      case 'generate':
        // Handle generation request
        await this.handleGeneration(websocket, data);
        break;
        
      case 'stats':
        // Get real-time stats
        await this.handleStats(websocket, data);
        break;
        
      default:
        websocket.send(JSON.stringify({
          type: 'error',
          error: 'Unknown message type'
        }));
    }
  }
  
  async handleGeneration(websocket, data) {
    // This would integrate with the AI models
    // For now, just acknowledge
    websocket.send(JSON.stringify({
      type: 'generation-started',
      requestId: data.requestId
    }));
  }
  
  async handleStats(websocket, data) {
    try {
      const { binId } = data;
      
      if (!binId) {
        websocket.send(JSON.stringify({
          type: 'stats',
          stats: { totalBins: 0, totalConversations: 0 }
        }));
        return;
      }
      
      // Get conversation count for the bin
      const list = await this.env.CONVERSATIONS.list({ prefix: `${binId}:` });
      const conversationCount = list.keys.length;
      
      websocket.send(JSON.stringify({
        type: 'stats',
        stats: { conversationCount }
      }));
    } catch (error) {
      websocket.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
    }
  }
}