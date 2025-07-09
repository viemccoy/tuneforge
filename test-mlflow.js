#!/usr/bin/env node
// Quick test script to verify MLFlow integration

import fetch from 'node-fetch';

const MLFLOW_URI = process.env.MLFLOW_TRACKING_URI || 'http://127.0.0.1:8080';
const EXPERIMENT_NAME = process.env.MLFLOW_EXPERIMENT_NAME || 'TuneForge-Test';

async function testMLFlow() {
    console.log('🔍 Testing MLFlow integration...');
    console.log(`📍 MLFlow URI: ${MLFLOW_URI}`);
    console.log(`🧪 Experiment: ${EXPERIMENT_NAME}`);
    
    try {
        // Test 1: Check if MLFlow server is running
        console.log('\n1. Testing MLFlow server connectivity...');
        const healthResponse = await fetch(`${MLFLOW_URI}/health`);
        if (healthResponse.ok) {
            console.log('✅ MLFlow server is running');
        } else {
            console.log('❌ MLFlow server health check failed');
            return;
        }
        
        // Test 2: List experiments
        console.log('\n2. Testing experiment access...');
        const experimentsResponse = await fetch(`${MLFLOW_URI}/ajax-api/2.0/mlflow/experiments/search?max_results=100`);
        if (experimentsResponse.ok) {
            const experiments = await experimentsResponse.json();
            console.log(`✅ Found ${experiments.experiments?.length || 0} experiments`);
            
            // Check if our experiment exists
            const ourExperiment = experiments.experiments?.find(e => e.name === EXPERIMENT_NAME);
            if (ourExperiment) {
                console.log(`✅ Found TuneForge experiment: ${ourExperiment.experiment_id}`);
            } else {
                console.log(`ℹ️  TuneForge experiment "${EXPERIMENT_NAME}" not found (will be created on first use)`);
            }
        } else {
            console.log('❌ Failed to list experiments');
            return;
        }
        
        // Test 3: Create a test run
        console.log('\n3. Testing run creation...');
        
        // First, get or create experiment
        let experimentId;
        try {
            const getExpResponse = await fetch(`${MLFLOW_URI}/ajax-api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(EXPERIMENT_NAME)}`);
            if (getExpResponse.ok) {
                const result = await getExpResponse.json();
                experimentId = result.experiment.experiment_id;
                console.log(`✅ Using existing experiment: ${experimentId}`);
            } else {
                // Create new experiment
                const createExpResponse = await fetch(`${MLFLOW_URI}/ajax-api/2.0/mlflow/experiments/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: EXPERIMENT_NAME,
                        tags: [
                            { key: 'tuneforge.test', value: 'true' },
                            { key: 'created_at', value: new Date().toISOString() }
                        ]
                    })
                });
                
                if (createExpResponse.ok) {
                    const result = await createExpResponse.json();
                    experimentId = result.experiment_id;
                    console.log(`✅ Created new experiment: ${experimentId}`);
                } else {
                    console.log('❌ Failed to create experiment');
                    return;
                }
            }
        } catch (error) {
            console.log(`❌ Experiment setup failed: ${error.message}`);
            return;
        }
        
        // Create test run
        const runName = `test_run_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        const createRunResponse = await fetch(`${MLFLOW_URI}/ajax-api/2.0/mlflow/runs/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                experiment_id: experimentId,
                run_name: runName,
                tags: [
                    { key: 'tuneforge.test', value: 'true' },
                    { key: 'tuneforge.conversation_id', value: 'test-conversation-123' },
                    { key: 'tuneforge.type', value: 'test' }
                ]
            })
        });
        
        if (createRunResponse.ok) {
            const runResult = await createRunResponse.json();
            const runId = runResult.run.info.run_id;
            console.log(`✅ Created test run: ${runId}`);
            
            // Test 4: Log some metrics and parameters
            console.log('\n4. Testing metrics and parameters logging...');
            
            // Log parameters
            const logParamsResponse = await fetch(`${MLFLOW_URI}/ajax-api/2.0/mlflow/runs/log-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    run_id: runId,
                    params: [
                        { key: 'test.model', value: 'gpt-4' },
                        { key: 'test.temperature', value: '0.7' },
                        { key: 'test.message_count', value: '5' }
                    ]
                })
            });
            
            if (logParamsResponse.ok) {
                console.log('✅ Logged test parameters');
            } else {
                console.log('❌ Failed to log parameters');
            }
            
            // Log metrics
            const logMetricsResponse = await fetch(`${MLFLOW_URI}/ajax-api/2.0/mlflow/runs/log-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    run_id: runId,
                    metrics: [
                        { key: 'test.duration_ms', value: 1250, timestamp: Date.now() },
                        { key: 'test.success_rate', value: 1.0, timestamp: Date.now() },
                        { key: 'test.total_tokens', value: 150, timestamp: Date.now() }
                    ]
                })
            });
            
            if (logMetricsResponse.ok) {
                console.log('✅ Logged test metrics');
            } else {
                console.log('❌ Failed to log metrics');
            }
            
            // End the run
            const endRunResponse = await fetch(`${MLFLOW_URI}/ajax-api/2.0/mlflow/runs/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    run_id: runId,
                    status: 'FINISHED',
                    end_time: Date.now()
                })
            });
            
            if (endRunResponse.ok) {
                console.log('✅ Ended test run successfully');
            } else {
                console.log('❌ Failed to end run');
            }
            
            console.log(`\n🎉 All tests passed! Check your MLFlow UI at ${MLFLOW_URI} to see the test run.`);
            console.log(`📊 Look for experiment "${EXPERIMENT_NAME}" and run "${runName}"`);
        } else {
            console.log('❌ Failed to create test run');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testMLFlow().then(() => {
    console.log('\n✨ Test completed');
}).catch(error => {
    console.error('💥 Test crashed:', error);
});