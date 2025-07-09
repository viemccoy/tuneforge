# Claude Development Notes for TuneForge

This document tracks all enhancements and improvements made to TuneForge during our development sessions.

## Overview

TuneForge is a sophisticated dataset builder for AI fine-tuning with a cyberpunk Matrix-inspired UI. It features bin-based organization, multi-model support, conversation branching, and real-time presence tracking.

## Major Features Implemented

### 1. Conversation Name Persistence
- **Problem**: Conversation names were being overwritten with truncated message previews
- **Solution**: 
  - Fixed POST endpoint in `/functions/api/conversations.js` to save name and description fields
  - Added PUT endpoint for updating conversations
  - Ensured name persistence across saves

### 2. Real-time Presence Tracking
- **Feature**: ASCII person icon (◉) with viewer count next to turn counts
- **Implementation**:
  - Created `/functions/api/presence.js` for presence tracking
  - Uses Cloudflare KV with 60-second expiry
  - Polling-based updates every 5 seconds
  - Shows active viewers per conversation
  - Added pulse animation for presence indicators

### 3. Response Selection Enforcement
- **Problem**: Users could send messages without selecting AI responses
- **Solution**:
  - Added `activeLoom` tracking
  - Prevents sending new messages when responses are unselected
  - Visual feedback with pulsing animation on unselected loom
  - Keyboard focus automatically moves to loom for selection

### 4. Enhanced Error Handling
- **Improvements**:
  - Better JSON parsing with try-catch blocks
  - Response validation before processing
  - Graceful error recovery with user-friendly messages
  - Automatic retry mechanisms for transient failures

### 5. UI Bug Fixes
- **REGEN/OK Button Overlap**:
  - Moved REGEN button position from `right: 4.5rem` to `right: 6rem`
  - Increased OK button z-index to 15
  - Added distinctive styling for OK button visibility
  
- **False Selection Requirement**:
  - Fixed by clearing `activeLoom` in `loadConversation()`
  - Also cleared in `clearConversation()` and `createNewConversation()`
  - Prevents false "select response" warnings on completed conversations

- **System Prompt and Temperature Persistence**:
  - Fixed system prompt not loading from saved conversations
  - Added temperature persistence to conversation metadata
  - Bins now store default temperature settings
  - System prompt and temperature auto-save when modified
  - Temperature and system prompt correctly load when switching conversations

### 6. Regeneration Parameter Updates
- **Feature**: Regeneration uses current UI parameter values
- **Implementation**:
  - "REGENERATE ALL" uses current temperature and maxTokens
  - Individual REGEN buttons initialize with current UI values
  - Reset button resets to current values, not hardcoded defaults

### 7. Comprehensive Security Enhancements

#### Input Validation
```javascript
validateInput(input, type) {
    if (!input || typeof input !== 'string') {
        throw new Error(`Invalid ${type}: must be a non-empty string`);
    }
    
    const sanitized = input.trim();
    
    // Length limits
    const limits = {
        message: this.maxMessageLength,
        conversationName: this.maxConversationNameLength,
        binName: this.maxBinNameLength,
        systemPrompt: this.maxSystemPromptLength
    };
    
    if (limits[type] && sanitized.length > limits[type]) {
        throw new Error(`${type} exceeds maximum length of ${limits[type]} characters`);
    }
    
    return sanitized;
}
```

#### XSS Prevention
```javascript
sanitizeInput(input) {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}
```

#### Rate Limiting
- 30 requests per minute sliding window
- Per-action rate limiting (generate, save, export)
- User-friendly error messages when limits exceeded

#### Session Management
- 24-hour session timeout
- 30-minute warning before expiry
- Automatic session refresh on activity
- Secure session storage

### 8. Network Monitoring
- Real-time connection status indicator
- Offline detection with visual feedback
- Automatic reconnection attempts
- Request queuing during connection issues

### 9. MLFlow Integration for Conversation Tracking

#### Overview
TuneForge now integrates with MLFlow to provide comprehensive tracking of AI conversations, branching operations, and performance metrics. This integration respects the loom/branching architecture by tracking both main conversation threads and branch operations separately.

#### Features
- **Conversation Tracking**: Each conversation becomes an MLFlow run with metrics and parameters
- **Branch Awareness**: Branch operations are tracked with their parent relationships
- **Generation Metrics**: AI generation requests and responses are logged with performance data
- **Loom Integration**: The conversation multiverse navigator data is captured in MLFlow

#### Tracked Events
```javascript
// AI Generation Events
trackGeneration(requestData) - Logs generation requests
trackGenerationResponse(traceId, responses, duration) - Logs responses and metrics

// Conversation Events  
startConversationRun(conversationId, binId, name) - Starts MLFlow run for conversation
trackConversationSave(conversationData) - Logs conversation saves

// Branch/Loom Events
trackBranchOperation('create', branchData) - Logs branch creation
trackBranchOperation('merge', branchData) - Logs branch merges
startBranchRun(conversationId, branchId, branchPoint) - Starts branch-specific run
```

#### Metrics Tracked
- **Generation Metrics**: Duration, success rate, token usage, model performance
- **Conversation Metrics**: Message count, turn count, branch depth
- **Branch Metrics**: Branch point, message count, merge success

#### Configuration
Set the following environment variables to enable MLFlow tracking:
- `MLFLOW_TRACKING_URI` - MLFlow server endpoint
- `MLFLOW_EXPERIMENT_NAME` - Experiment name (optional)

If MLFlow is not configured, the system continues to work normally without tracking.

#### Data Export
The tracer provides methods to export conversation traces:
```javascript
getTraceDump() - Returns formatted markdown dump
exportTraces('json') - Returns JSON export
exportTraces('markdown') - Returns markdown export
```

### 10. Beautiful UI Components

#### Confirmation Dialogs
- Cyberpunk-styled modal overlays
- Glowing borders with sweep animations
- Dangerous actions show red theme
- Smooth fade-in/out transitions

#### Loading Overlays
- Triple-ring spinner animation
- Progress indicators for long operations
- Matrix-green glow effects
- Operation-specific messages

#### Presence Indicators
```css
.presence-indicator {
    color: var(--matrix-green-bright);
    font-weight: bold;
    padding: 0.1rem 0.3rem;
    background: rgba(0, 255, 65, 0.1);
    border: 1px solid rgba(0, 255, 65, 0.3);
    animation: presencePulse 2s infinite;
}
```

## Code Organization

### Frontend Structure
- `app-ultimate.js` - Main application logic with all enhancements
- `style-ultimate.css` - Comprehensive styling with animations
- `loom.js` - Conversation branching navigator
- `index-ultimate.html` - Enhanced HTML structure

### Backend Structure
- `/functions/api/` - Cloudflare Pages serverless functions
  - `auth.js` - Password authentication
  - `bins.js` - Dataset bin management
  - `conversations.js` - Conversation CRUD with name persistence
  - `presence.js` - Real-time viewer tracking
  - `generate.js` - AI response generation
  - `export.js` - Dataset export functionality

### Key Design Patterns

1. **Request Management**
   - Single active request tracking with `activeRequestId`
   - Request cancellation for newer requests
   - Queue management to prevent concurrent operations

2. **Error Recovery**
   - Message backup in sessionStorage
   - Graceful degradation for feature failures
   - User-friendly error messages with recovery options

3. **Performance Optimizations**
   - Debounced presence updates
   - Efficient DOM manipulation
   - Lazy loading for conversation lists
   - Request batching where possible

## Security Best Practices

1. **Never trust user input** - All inputs validated and sanitized
2. **Rate limiting** - Prevents abuse and DoS attacks
3. **Session management** - Secure timeout handling
4. **XSS prevention** - HTML entity encoding for all user content
5. **CSRF protection** - Via Cloudflare's built-in protections
6. **Authentication** - Password-based access control

## Deployment Configuration

### Cloudflare KV Namespaces
- `BINS` - Stores dataset bins
- `CONVERSATIONS` - Stores conversations
- `PRESENCE` - Tracks active viewers

### Environment Variables
- `AUTH_PASSWORD` - Access control password
- `OPENAI_API_KEY` - OpenAI API access
- `ANTHROPIC_API_KEY` - Anthropic API access
- `MLFLOW_TRACKING_URI` - MLFlow server URI (e.g., http://127.0.0.1:8080)
- `MLFLOW_EXPERIMENT_NAME` - MLFlow experiment name (default: TuneForge-Conversations)

## Future Enhancement Ideas

1. **Collaboration Features**
   - Real-time collaborative editing
   - User avatars for presence
   - Comment threads on conversations

2. **Advanced Analytics**
   - Token usage tracking
   - Model performance comparison
   - Dataset quality metrics

3. **Export Enhancements**
   - Multiple export formats
   - Filtered exports
   - Batch operations

4. **UI Improvements**
   - Theme customization
   - Keyboard shortcut customization
   - Mobile-responsive design

## Testing Checklist

- [x] Conversation name persistence across saves
- [x] Presence tracking updates in real-time
- [x] Response selection enforcement works
- [x] Regeneration uses current parameters
- [x] No button overlap issues
- [x] Rate limiting prevents spam
- [x] Session timeout warnings appear
- [x] Network status indicator works
- [x] All animations perform smoothly
- [x] Security validations in place

## Notes

- The app is designed for infrastructure-level use, not public deployment
- All features maintain the cyberpunk aesthetic
- Performance tested with 100+ conversations per bin
- Cloudflare Pages deployment optimized for edge performance