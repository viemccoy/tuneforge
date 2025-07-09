// MLFlow Integration for TuneForge
// Adapted from mlflow_callback.py to work with TuneForge's conversation system

class TuneForgeMlflowTracer {
    constructor(experimentName = 'TuneForge-Conversations', trackingUri = 'http://127.0.0.1:8080') {
        this.experimentName = experimentName;
        this.trackingUri = trackingUri;
        this.traceData = [];
        this.currentRunId = null;
        this.enabled = false;
        
        // TuneForge specific tracking
        this.conversationTraces = new Map();
        this.branchTraces = new Map();
        this.currentConversationId = null;
        this.currentBranchId = null;
        
        this.initializeMLFlow();
    }
    
    async initializeMLFlow() {
        try {
            // Check if MLFlow server is available (using correct API path for MLFlow 3.x)
            const response = await fetch(`${this.trackingUri}/ajax-api/2.0/mlflow/experiments/search?max_results=1`, {
                method: 'GET'
            });
            
            if (response.ok) {
                this.enabled = true;
                console.log(`✓ MLFlow server connected: ${this.trackingUri}`);
                console.log(`✓ Experiment: ${this.experimentName}`);
            } else {
                console.warn(`⚠ MLFlow server unavailable at ${this.trackingUri}`);
            }
        } catch (error) {
            console.warn(`⚠ MLFlow initialization failed: ${error.message}`);
        }
    }
    
    // Start tracking a conversation
    async startConversationRun(conversationId, binId, conversationName = null) {
        if (!this.enabled) return;
        
        this.currentConversationId = conversationId;
        
        const runName = conversationName || `conversation_${conversationId.substring(0, 8)}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        
        try {
            const response = await fetch(`${this.trackingUri}/ajax-api/2.0/mlflow/runs/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    experiment_id: await this.getOrCreateExperiment(),
                    run_name: runName,
                    tags: [
                        { key: 'tuneforge.conversation_id', value: conversationId },
                        { key: 'tuneforge.bin_id', value: binId },
                        { key: 'tuneforge.type', value: 'conversation' },
                        { key: 'tuneforge.created_at', value: new Date().toISOString() }
                    ]
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.currentRunId = result.run.info.run_id;
                this.conversationTraces.set(conversationId, {
                    runId: this.currentRunId,
                    traces: [],
                    startTime: Date.now()
                });
                console.log(`✓ Started MLFlow run for conversation: ${runName}`);
            }
        } catch (error) {
            console.error(`✗ Failed to start MLFlow run: ${error.message}`);
        }
    }
    
    // Start tracking a branch
    async startBranchRun(conversationId, branchId, branchPoint, parentRunId = null) {
        if (!this.enabled) return;
        
        this.currentBranchId = branchId;
        
        const runName = `branch_${branchId.substring(0, 8)}_from_${branchPoint}`;
        
        try {
            const response = await fetch(`${this.trackingUri}/ajax-api/2.0/mlflow/runs/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    experiment_id: await this.getOrCreateExperiment(),
                    run_name: runName,
                    tags: [
                        { key: 'tuneforge.conversation_id', value: conversationId },
                        { key: 'tuneforge.branch_id', value: branchId },
                        { key: 'tuneforge.branch_point', value: branchPoint.toString() },
                        { key: 'tuneforge.parent_run_id', value: parentRunId || '' },
                        { key: 'tuneforge.type', value: 'branch' },
                        { key: 'tuneforge.created_at', value: new Date().toISOString() }
                    ]
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                const branchRunId = result.run.info.run_id;
                this.branchTraces.set(branchId, {
                    runId: branchRunId,
                    traces: [],
                    branchPoint,
                    parentRunId,
                    startTime: Date.now()
                });
                console.log(`✓ Started MLFlow run for branch: ${runName}`);
            }
        } catch (error) {
            console.error(`✗ Failed to start branch run: ${error.message}`);
        }
    }
    
    // Track AI generation request
    async trackGeneration(requestData) {
        if (!this.enabled) return;
        
        const traceId = this.generateTraceId();
        const timestamp = new Date().toISOString();
        
        const trace = {
            id: traceId,
            type: 'ai_generation',
            timestamp,
            conversationId: this.currentConversationId,
            branchId: this.currentBranchId,
            request: {
                models: requestData.models,
                temperature: requestData.temperature,
                maxTokens: requestData.maxTokens,
                systemPrompt: requestData.systemPrompt?.substring(0, 500) + '...',
                messageCount: requestData.messages?.length || 0,
                lastMessage: requestData.messages?.length > 0 ? 
                    requestData.messages[requestData.messages.length - 1].content.substring(0, 200) + '...' : null
            }
        };
        
        this.addTrace(trace);
        
        // Log to MLFlow
        await this.logToMLFlow({
            runId: this.getCurrentRunId(),
            metrics: {
                'generation.message_count': requestData.messages?.length || 0,
                'generation.model_count': requestData.models?.length || 0,
                'generation.temperature': requestData.temperature || 0.7,
                'generation.max_tokens': requestData.maxTokens || 1000
            },
            params: {
                'generation.models': JSON.stringify(requestData.models),
                'generation.system_prompt_preview': requestData.systemPrompt?.substring(0, 100) || '',
                'generation.trace_id': traceId
            }
        });
        
        return traceId;
    }
    
    // Track AI generation response
    async trackGenerationResponse(traceId, responses, duration) {
        if (!this.enabled) return;
        
        const trace = this.findTrace(traceId);
        if (!trace) return;
        
        trace.response = {
            duration,
            responses: responses.map(r => ({
                model: r.model,
                success: !r.error,
                error: r.error || null,
                contentLength: r.content?.length || 0,
                usage: r.usage || null
            })),
            successCount: responses.filter(r => !r.error).length,
            totalResponses: responses.length
        };
        
        trace.completed = true;
        
        // Calculate metrics
        const totalTokens = responses.reduce((sum, r) => sum + (r.usage?.total_tokens || 0), 0);
        const avgResponseLength = responses.reduce((sum, r) => sum + (r.content?.length || 0), 0) / responses.length;
        
        await this.logToMLFlow({
            runId: this.getCurrentRunId(),
            metrics: {
                'response.duration_ms': duration,
                'response.success_rate': trace.response.successCount / trace.response.totalResponses,
                'response.total_tokens': totalTokens,
                'response.avg_length': avgResponseLength,
                'response.success_count': trace.response.successCount
            },
            params: {
                'response.models_used': JSON.stringify(responses.map(r => r.model)),
                'response.trace_id': traceId
            }
        });
    }
    
    // Track conversation save
    async trackConversationSave(conversationData) {
        if (!this.enabled) return;
        
        const trace = {
            id: this.generateTraceId(),
            type: 'conversation_save',
            timestamp: new Date().toISOString(),
            conversationId: this.currentConversationId,
            branchId: this.currentBranchId,
            data: {
                messageCount: conversationData.messages?.length || 0,
                name: conversationData.name,
                description: conversationData.description
            }
        };
        
        this.addTrace(trace);
        
        await this.logToMLFlow({
            runId: this.getCurrentRunId(),
            metrics: {
                'save.message_count': conversationData.messages?.length || 0
            },
            params: {
                'save.conversation_name': conversationData.name || '',
                'save.trace_id': trace.id
            }
        });
    }
    
    // Track branch operations
    async trackBranchOperation(operation, branchData) {
        if (!this.enabled) return;
        
        const trace = {
            id: this.generateTraceId(),
            type: `branch_${operation}`,
            timestamp: new Date().toISOString(),
            conversationId: this.currentConversationId,
            branchId: branchData.branchId || this.currentBranchId,
            data: {
                operation,
                branchPoint: branchData.branchPoint,
                messageCount: branchData.messages?.length || 0,
                metadata: branchData.metadata
            }
        };
        
        this.addTrace(trace);
        
        await this.logToMLFlow({
            runId: this.getCurrentRunId(),
            metrics: {
                [`branch_${operation}.message_count`]: branchData.messages?.length || 0,
                [`branch_${operation}.branch_point`]: branchData.branchPoint || 0
            },
            params: {
                [`branch_${operation}.operation`]: operation,
                [`branch_${operation}.trace_id`]: trace.id
            }
        });
    }
    
    // End current run
    async endRun(runType = 'conversation') {
        if (!this.enabled) return;
        
        const runId = this.getCurrentRunId();
        if (!runId) return;
        
        try {
            await fetch(`${this.trackingUri}/ajax-api/2.0/mlflow/runs/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    run_id: runId,
                    status: 'FINISHED',
                    end_time: Date.now()
                })
            });
            
            console.log(`✓ Ended MLFlow run: ${runId}`);
            
            if (runType === 'conversation') {
                this.currentRunId = null;
            }
        } catch (error) {
            console.error(`✗ Failed to end MLFlow run: ${error.message}`);
        }
    }
    
    // Get formatted trace dump for debugging
    getTraceDump() {
        if (this.traceData.length === 0) {
            return 'No trace data available.';
        }
        
        let dump = '=== TUNEFORGE MLFLOW TRACE DUMP ===\n\n';
        
        this.traceData.forEach((trace, index) => {
            dump += `## Trace ${index + 1}: ${trace.type.toUpperCase()}\n`;
            dump += `**Timestamp:** ${trace.timestamp}\n`;
            dump += `**Conversation ID:** ${trace.conversationId || 'N/A'}\n`;
            dump += `**Branch ID:** ${trace.branchId || 'N/A'}\n`;
            dump += `**Trace ID:** ${trace.id}\n`;
            
            if (trace.request) {
                dump += '**Request:**\n```json\n';
                dump += JSON.stringify(trace.request, null, 2);
                dump += '\n```\n';
            }
            
            if (trace.response) {
                dump += '**Response:**\n```json\n';
                dump += JSON.stringify(trace.response, null, 2);
                dump += '\n```\n';
            }
            
            if (trace.data) {
                dump += '**Data:**\n```json\n';
                dump += JSON.stringify(trace.data, null, 2);
                dump += '\n```\n';
            }
            
            dump += '\n' + '-'.repeat(80) + '\n\n';
        });
        
        return dump;
    }
    
    // Export trace data
    async exportTraces(format = 'json') {
        const data = {
            experiment: this.experimentName,
            trackingUri: this.trackingUri,
            exportedAt: new Date().toISOString(),
            conversationTraces: Object.fromEntries(this.conversationTraces),
            branchTraces: Object.fromEntries(this.branchTraces),
            traces: this.traceData
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'markdown') {
            return this.getTraceDump();
        }
        
        return data;
    }
    
    // Private helper methods
    getCurrentRunId() {
        if (this.currentBranchId && this.branchTraces.has(this.currentBranchId)) {
            return this.branchTraces.get(this.currentBranchId).runId;
        }
        return this.currentRunId;
    }
    
    addTrace(trace) {
        this.traceData.push(trace);
        
        // Add to conversation or branch specific traces
        const targetTraces = this.currentBranchId && this.branchTraces.has(this.currentBranchId) ?
            this.branchTraces.get(this.currentBranchId).traces :
            this.conversationTraces.get(this.currentConversationId)?.traces;
        
        if (targetTraces) {
            targetTraces.push(trace);
        }
    }
    
    findTrace(traceId) {
        return this.traceData.find(t => t.id === traceId);
    }
    
    generateTraceId() {
        return 'trace_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }
    
    async getOrCreateExperiment() {
        try {
            // Try to get existing experiment
            const listResponse = await fetch(`${this.trackingUri}/ajax-api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(this.experimentName)}`);
            
            if (listResponse.ok) {
                const result = await listResponse.json();
                return result.experiment.experiment_id;
            }
            
            // Create new experiment
            const createResponse = await fetch(`${this.trackingUri}/ajax-api/2.0/mlflow/experiments/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: this.experimentName,
                    tags: [
                        { key: 'tuneforge.created_at', value: new Date().toISOString() },
                        { key: 'tuneforge.type', value: 'conversation_tracking' }
                    ]
                })
            });
            
            if (createResponse.ok) {
                const result = await createResponse.json();
                return result.experiment_id;
            }
            
            throw new Error('Failed to create experiment');
        } catch (error) {
            console.error('Error managing experiment:', error);
            return '0'; // Default experiment
        }
    }
    
    async logToMLFlow(data) {
        if (!this.enabled || !data.runId) return;
        
        try {
            if (data.metrics) {
                await fetch(`${this.trackingUri}/ajax-api/2.0/mlflow/runs/log-batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        run_id: data.runId,
                        metrics: Object.entries(data.metrics).map(([key, value]) => ({
                            key,
                            value: typeof value === 'number' ? value : parseFloat(value) || 0,
                            timestamp: Date.now()
                        }))
                    })
                });
            }
            
            if (data.params) {
                await fetch(`${this.trackingUri}/ajax-api/2.0/mlflow/runs/log-batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        run_id: data.runId,
                        params: Object.entries(data.params).map(([key, value]) => ({
                            key,
                            value: String(value).substring(0, 250) // MLFlow param limit
                        }))
                    })
                });
            }
        } catch (error) {
            console.debug('MLFlow logging failed:', error.message);
        }
    }
}

// Global instance
let mlflowTracer = null;

// Initialize MLFlow tracing
export function initializeMlflowTracing(experimentName, trackingUri) {
    mlflowTracer = new TuneForgeMlflowTracer(experimentName, trackingUri);
    return mlflowTracer;
}

// Get global tracer instance
export function getMlflowTracer() {
    return mlflowTracer;
}

// Convenience functions
export function trackGeneration(requestData) {
    return mlflowTracer?.trackGeneration(requestData);
}

export function trackGenerationResponse(traceId, responses, duration) {
    return mlflowTracer?.trackGenerationResponse(traceId, responses, duration);
}

export function trackConversationSave(conversationData) {
    return mlflowTracer?.trackConversationSave(conversationData);
}

export function trackBranchOperation(operation, branchData) {
    return mlflowTracer?.trackBranchOperation(operation, branchData);
}

export function startConversationRun(conversationId, binId, conversationName) {
    return mlflowTracer?.startConversationRun(conversationId, binId, conversationName);
}

export function startBranchRun(conversationId, branchId, branchPoint, parentRunId) {
    return mlflowTracer?.startBranchRun(conversationId, branchId, branchPoint, parentRunId);
}

export function endRun(runType) {
    return mlflowTracer?.endRun(runType);
}

export function getTraceDump() {
    return mlflowTracer?.getTraceDump() || 'MLFlow tracing not initialized.';
}

export function exportTraces(format) {
    return mlflowTracer?.exportTraces(format);
}

export default TuneForgeMlflowTracer;