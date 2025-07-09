#!/usr/bin/env node
// Test TuneForge MLFlow integration

import TuneForgeMlflowTracer from './src/lib/mlflow-tracer.js';

const MLFLOW_URI = process.env.MLFLOW_TRACKING_URI || 'http://127.0.0.1:8080';
const EXPERIMENT_NAME = process.env.MLFLOW_EXPERIMENT_NAME || 'TuneForge-Test';

async function testTuneForgeMlflowIntegration() {
    console.log('🚀 Testing TuneForge MLFlow Integration...');
    
    try {
        // Create tracer instance
        const tracer = new TuneForgeMlflowTracer(EXPERIMENT_NAME, MLFLOW_URI);
        
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`✅ Tracer created. Enabled: ${tracer.enabled}`);
        
        if (!tracer.enabled) {
            console.log('❌ MLFlow tracer not enabled - check connection');
            return;
        }
        
        // Test conversation tracking
        console.log('\n📝 Testing conversation tracking...');
        const conversationId = 'test-conv-' + Date.now();
        const binId = 'test-bin-123';
        
        await tracer.startConversationRun(conversationId, binId, 'Test Conversation');
        console.log('✅ Started conversation run');
        
        // Test generation tracking
        console.log('\n🤖 Testing generation tracking...');
        const traceId = await tracer.trackGeneration({
            binId,
            systemPrompt: 'You are a helpful assistant.',
            messages: [
                { role: 'user', content: 'Hello, how are you?' }
            ],
            models: ['gpt-4', 'claude-3-sonnet'],
            temperature: 0.7,
            maxTokens: 100
        });
        console.log(`✅ Generated trace ID: ${traceId}`);
        
        // Simulate response
        const mockResponses = [
            {
                model: 'gpt-4',
                content: 'Hello! I am doing well, thank you for asking.',
                usage: { total_tokens: 25, prompt_tokens: 15, completion_tokens: 10 }
            },
            {
                model: 'claude-3-sonnet',
                content: 'I am doing great! How can I help you today?',
                usage: { total_tokens: 28, prompt_tokens: 15, completion_tokens: 13 }
            }
        ];
        
        await tracer.trackGenerationResponse(traceId, mockResponses, 1500);
        console.log('✅ Tracked generation response');
        
        // Test conversation save
        console.log('\n💾 Testing conversation save...');
        await tracer.trackConversationSave({
            name: 'Test Conversation',
            description: 'A test conversation for MLFlow integration',
            messages: [
                { role: 'user', content: 'Hello, how are you?' },
                { role: 'assistant', content: 'Hello! I am doing well, thank you for asking.' }
            ]
        });
        console.log('✅ Tracked conversation save');
        
        // Test branch operations
        console.log('\n🌿 Testing branch operations...');
        const branchId = 'test-branch-' + Date.now();
        
        await tracer.trackBranchOperation('create', {
            branchId,
            branchPoint: 1,
            messages: [
                { role: 'user', content: 'Hello, how are you?' },
                { role: 'assistant', content: 'I am doing great! How can I help you today?' }
            ],
            metadata: { createdAt: new Date().toISOString() }
        });
        console.log('✅ Tracked branch creation');
        
        // End the run
        console.log('\n🏁 Ending run...');
        await tracer.endRun('conversation');
        console.log('✅ Ended conversation run');
        
        // Get trace dump
        console.log('\n📊 Getting trace dump...');
        const dump = tracer.getTraceDump();
        console.log('✅ Generated trace dump');
        console.log(`📄 Trace dump length: ${dump.length} characters`);
        
        console.log('\n🎉 All TuneForge MLFlow integration tests passed!');
        console.log(`🔗 Check your MLFlow UI: ${MLFLOW_URI}`);
        console.log(`📚 Experiment: ${EXPERIMENT_NAME}`);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testTuneForgeMlflowIntegration().then(() => {
    console.log('\n✨ Test completed');
}).catch(error => {
    console.error('💥 Test crashed:', error);
});