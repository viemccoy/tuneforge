// MLFlow trace access endpoint
import TuneForgeMlflowTracer from '../../src/lib/mlflow-tracer.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const format = url.searchParams.get('format') || 'json';
  
  if (!env.MLFLOW_TRACKING_URI) {
    return new Response(JSON.stringify({ 
      error: 'MLFlow not configured',
      message: 'Set MLFLOW_TRACKING_URI environment variable to enable MLFlow tracking'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const mlflowTracer = new TuneForgeMlflowTracer(
      env.MLFLOW_EXPERIMENT_NAME || 'TuneForge-Conversations',
      env.MLFLOW_TRACKING_URI
    );
    
    switch (action) {
      case 'dump':
        const dump = mlflowTracer.getTraceDump();
        if (format === 'markdown') {
          return new Response(dump, {
            headers: { 
              'Content-Type': 'text/markdown',
              'Content-Disposition': 'attachment; filename="tuneforge-traces.md"'
            }
          });
        }
        return new Response(JSON.stringify({ dump }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      case 'export':
        const exportData = await mlflowTracer.exportTraces(format);
        if (format === 'markdown') {
          return new Response(exportData, {
            headers: { 
              'Content-Type': 'text/markdown',
              'Content-Disposition': 'attachment; filename="tuneforge-export.md"'
            }
          });
        }
        return new Response(typeof exportData === 'string' ? exportData : JSON.stringify(exportData, null, 2), {
          headers: { 
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="tuneforge-export.json"'
          }
        });
        
      case 'status':
        return new Response(JSON.stringify({
          enabled: mlflowTracer.enabled,
          trackingUri: mlflowTracer.trackingUri,
          experimentName: mlflowTracer.experimentName,
          traceCount: mlflowTracer.traceData.length,
          conversationCount: mlflowTracer.conversationTraces.size,
          branchCount: mlflowTracer.branchTraces.size
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      case 'conversations':
        const conversations = Array.from(mlflowTracer.conversationTraces.entries()).map(([id, data]) => ({
          conversationId: id,
          runId: data.runId,
          traceCount: data.traces.length,
          startTime: new Date(data.startTime).toISOString()
        }));
        return new Response(JSON.stringify({ conversations }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      case 'branches':
        const branches = Array.from(mlflowTracer.branchTraces.entries()).map(([id, data]) => ({
          branchId: id,
          runId: data.runId,
          branchPoint: data.branchPoint,
          parentRunId: data.parentRunId,
          traceCount: data.traces.length,
          startTime: new Date(data.startTime).toISOString()
        }));
        return new Response(JSON.stringify({ branches }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      default:
        return new Response(JSON.stringify({
          error: 'Invalid action',
          availableActions: ['dump', 'export', 'status', 'conversations', 'branches'],
          usage: 'GET /api/mlflow-traces?action=status&format=json'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  if (!env.MLFLOW_TRACKING_URI) {
    return new Response(JSON.stringify({ 
      error: 'MLFlow not configured' 
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const { action, data } = await request.json();
    
    const mlflowTracer = new TuneForgeMlflowTracer(
      env.MLFLOW_EXPERIMENT_NAME || 'TuneForge-Conversations',
      env.MLFLOW_TRACKING_URI
    );
    
    switch (action) {
      case 'start_conversation':
        const { conversationId, binId, conversationName } = data;
        await mlflowTracer.startConversationRun(conversationId, binId, conversationName);
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      case 'start_branch':
        const { branchId, branchPoint, parentRunId } = data;
        await mlflowTracer.startBranchRun(data.conversationId, branchId, branchPoint, parentRunId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      case 'end_run':
        await mlflowTracer.endRun(data.runType || 'conversation');
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      default:
        return new Response(JSON.stringify({
          error: 'Invalid action',
          availableActions: ['start_conversation', 'start_branch', 'end_run']
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}