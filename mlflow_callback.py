# mlflow_callback.py - MLFlow tracing integration for DSPy

import mlflow
import mlflow.dspy
from dspy.utils.callback import BaseCallback
import json
import traceback
from datetime import datetime
from typing import Any, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class MLFlowDSPyCallback(BaseCallback):
    """Enhanced MLFlow callback with comprehensive tracing and easy copy-paste dumps."""
    
    def __init__(self, experiment_name: str = "G-Buddy-DSPy", tracking_uri: str = "http://127.0.0.1:8080"):
        self.experiment_name = experiment_name
        self.tracking_uri = tracking_uri
        self.trace_data = []
        self.current_run_id = None
        
        # Configure MLFlow
        try:
            mlflow.set_tracking_uri(tracking_uri)
            mlflow.set_experiment(experiment_name)
            # Enable DSPy autologging
            mlflow.dspy.autolog()
            logger.info(f"✓ MLFlow configured: {tracking_uri} | Experiment: {experiment_name}")
        except Exception as e:
            logger.warning(f"⚠ MLFlow setup failed: {e}")
    
    def start_run(self, run_name: str = None):
        """Start a new MLFlow run."""
        try:
            if run_name is None:
                run_name = f"dspy_run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            mlflow.start_run(run_name=run_name)
            self.current_run_id = mlflow.active_run().info.run_id
            self.trace_data = []
            logger.info(f"✓ Started MLFlow run: {run_name} ({self.current_run_id})")
        except Exception as e:
            logger.error(f"✗ Failed to start MLFlow run: {e}")
    
    def end_run(self):
        """End the current MLFlow run."""
        try:
            if mlflow.active_run():
                mlflow.end_run()
                logger.info(f"✓ Ended MLFlow run: {self.current_run_id}")
        except Exception as e:
            logger.error(f"✗ Failed to end MLFlow run: {e}")
    
    def get_trace_dump(self) -> str:
        """Get a formatted trace dump for easy copy-paste to Claude."""
        if not self.trace_data:
            return "No trace data available."
        
        dump = "=== DSPY EXECUTION TRACE DUMP ===\n\n"
        
        for i, trace in enumerate(self.trace_data, 1):
            dump += f"## Trace {i}: {trace['type']} - {trace['component']}\n"
            dump += f"**Timestamp:** {trace['timestamp']}\n"
            dump += f"**Call ID:** {trace['call_id']}\n"
            
            if trace['inputs']:
                dump += "**Inputs:**\n```json\n"
                dump += json.dumps(trace['inputs'], indent=2, default=str)
                dump += "\n```\n"
            
            if trace['outputs']:
                dump += "**Outputs:**\n```json\n"
                dump += json.dumps(trace['outputs'], indent=2, default=str)
                dump += "\n```\n"
            
            if trace.get('exception'):
                dump += f"**Exception:** {trace['exception']}\n"
            
            if trace.get('reasoning'):
                dump += f"**Reasoning:** {trace['reasoning']}\n"
            
            dump += "\n" + "-"*80 + "\n\n"
        
        return dump
    
    def save_trace_dump(self, filename: str = None):
        """Save trace dump to file."""
        if filename is None:
            filename = f"dspy_trace_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        
        try:
            with open(filename, 'w') as f:
                f.write(self.get_trace_dump())
            logger.info(f"✓ Trace dump saved to: {filename}")
            return filename
        except Exception as e:
            logger.error(f"✗ Failed to save trace dump: {e}")
            return None
    
    def _add_trace(self, trace_type: str, component: str, call_id: str, 
                   inputs: Dict[str, Any] = None, outputs: Any = None, 
                   exception: Exception = None):
        """Add a trace entry."""
        trace_entry = {
            'type': trace_type,
            'component': component,
            'call_id': call_id,
            'timestamp': datetime.now().isoformat(),
            'inputs': inputs or {},
            'outputs': outputs,
            'exception': str(exception) if exception else None
        }
        
        # Extract reasoning if available
        if outputs and hasattr(outputs, 'reasoning'):
            trace_entry['reasoning'] = outputs.reasoning
        elif isinstance(outputs, dict) and 'reasoning' in outputs:
            trace_entry['reasoning'] = outputs['reasoning']
        
        self.trace_data.append(trace_entry)
        
        # Log to MLFlow if active run
        try:
            if mlflow.active_run():
                mlflow.log_param(f"trace_{len(self.trace_data)}_type", trace_type)
                mlflow.log_param(f"trace_{len(self.trace_data)}_component", component)
                if inputs:
                    mlflow.log_param(f"trace_{len(self.trace_data)}_inputs", json.dumps(inputs, default=str)[:500])
        except Exception as e:
            logger.debug(f"MLFlow logging failed: {e}")
    
    # DSPy Callback Methods
    
    def on_module_start(self, call_id: str, instance: Any, inputs: Dict[str, Any]):
        """Called when a DSPy module starts."""
        component_name = instance.__class__.__name__
        self._add_trace("MODULE_START", component_name, call_id, inputs=inputs)
        
        try:
            if mlflow.active_run():
                mlflow.log_param(f"module_{call_id}", component_name)
        except Exception as e:
            logger.debug(f"MLFlow module start logging failed: {e}")
    
    def on_module_end(self, call_id: str, outputs: Optional[Any], exception: Optional[Exception] = None):
        """Called when a DSPy module ends."""
        # Find the corresponding start trace
        start_trace = None
        for trace in reversed(self.trace_data):
            if trace['call_id'] == call_id and trace['type'] == 'MODULE_START':
                start_trace = trace
                break
        
        component_name = start_trace['component'] if start_trace else "Unknown"
        self._add_trace("MODULE_END", component_name, call_id, outputs=outputs, exception=exception)
        
        try:
            if mlflow.active_run():
                if exception:
                    mlflow.log_param(f"module_{call_id}_error", str(exception)[:500])
                elif outputs:
                    mlflow.log_param(f"module_{call_id}_success", "true")
        except Exception as e:
            logger.debug(f"MLFlow module end logging failed: {e}")
    
    def on_lm_start(self, call_id: str, instance: Any, inputs: Dict[str, Any]):
        """Called when LM call starts."""
        self._add_trace("LM_START", "LM_Call", call_id, inputs=inputs)
        
        try:
            if mlflow.active_run():
                mlflow.log_param(f"lm_{call_id}_model", getattr(instance, 'model', 'unknown'))
        except Exception as e:
            logger.debug(f"MLFlow LM start logging failed: {e}")
    
    def on_lm_end(self, call_id: str, outputs: Optional[Dict[str, Any]], exception: Optional[Exception] = None):
        """Called when LM call ends."""
        self._add_trace("LM_END", "LM_Call", call_id, outputs=outputs, exception=exception)
        
        try:
            if mlflow.active_run():
                if exception:
                    mlflow.log_param(f"lm_{call_id}_error", str(exception)[:500])
                elif outputs:
                    mlflow.log_param(f"lm_{call_id}_tokens", outputs.get('usage', {}).get('total_tokens', 0))
        except Exception as e:
            logger.debug(f"MLFlow LM end logging failed: {e}")
    
    def on_tool_start(self, call_id: str, instance: Any, inputs: Dict[str, Any]):
        """Called when tool execution starts."""
        tool_name = getattr(instance, 'name', instance.__class__.__name__)
        self._add_trace("TOOL_START", tool_name, call_id, inputs=inputs)
        
        try:
            if mlflow.active_run():
                mlflow.log_param(f"tool_{call_id}", tool_name)
        except Exception as e:
            logger.debug(f"MLFlow tool start logging failed: {e}")
    
    def on_tool_end(self, call_id: str, outputs: Optional[Dict[str, Any]], exception: Optional[Exception] = None):
        """Called when tool execution ends."""
        # Find the corresponding start trace
        start_trace = None
        for trace in reversed(self.trace_data):
            if trace['call_id'] == call_id and trace['type'] == 'TOOL_START':
                start_trace = trace
                break
        
        tool_name = start_trace['component'] if start_trace else "Unknown"
        self._add_trace("TOOL_END", tool_name, call_id, outputs=outputs, exception=exception)
        
        try:
            if mlflow.active_run():
                if exception:
                    mlflow.log_param(f"tool_{call_id}_error", str(exception)[:500])
                elif outputs:
                    mlflow.log_param(f"tool_{call_id}_success", "true")
        except Exception as e:
            logger.debug(f"MLFlow tool end logging failed: {e}")

# Global callback instance
_mlflow_callback = None

def setup_mlflow_tracing(experiment_name: str = "G-Buddy-DSPy", 
                        tracking_uri: str = "http://127.0.0.1:8080",
                        auto_start_run: bool = True) -> MLFlowDSPyCallback:
    """Setup MLFlow tracing for DSPy."""
    global _mlflow_callback
    
    _mlflow_callback = MLFlowDSPyCallback(experiment_name, tracking_uri)
    
    # Configure DSPy to use our callback
    import dspy
    current_callbacks = dspy.settings.get("callbacks", [])
    current_callbacks.append(_mlflow_callback)
    dspy.settings.configure(callbacks=current_callbacks)
    
    if auto_start_run:
        _mlflow_callback.start_run()
    
    logger.info("✓ MLFlow tracing setup complete")
    return _mlflow_callback

def get_trace_dump() -> str:
    """Get current trace dump for copy-paste."""
    if _mlflow_callback:
        return _mlflow_callback.get_trace_dump()
    return "MLFlow tracing not initialized. Call setup_mlflow_tracing() first."

def save_trace_dump(filename: str = None) -> str:
    """Save trace dump to file."""
    if _mlflow_callback:
        return _mlflow_callback.save_trace_dump(filename)
    return None

def print_trace_dump():
    """Print trace dump to console for easy copy-paste."""
    print("\n" + "="*80)
    print("COPY-PASTE READY TRACE DUMP")
    print("="*80)
    print(get_trace_dump())
    print("="*80)