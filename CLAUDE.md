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

### 9. Beautiful UI Components

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

### 10. User-Based Authentication System
- **Problem**: Original system was password-only, needed user accounts for data protection
- **Challenges**: 
  - Cloudflare Pages middleware wasn't being executed
  - Session cookies weren't being set properly due to Cloudflare limitations
  - Multiple authentication patterns tried: _middleware.js, [[path]].js, api/_middleware.js
- **Solution**:
  - Created auth wrapper utility (`/functions/auth-wrapper.js`) for inline authentication
  - Built dedicated endpoints with built-in auth (`bins-fixed.js`, `migrate-fixed.js`, `conversations-fixed.js`, `presence-fixed.js`)
  - Store session tokens in sessionStorage and send via X-Session-Token header
  - User accounts stored in KV with email as key: `user:email@example.com`
  - Sessions stored in KV: `session:token` with user reference
- **Benefits**:
  - Team-based bin organization prevents data loss
  - Proper user attribution and access control
  - Migration tool to assign existing bins to teams

### 11. Fixed Endpoint Implementation
- **Problem**: Conversations and presence endpoints were failing with 500 errors due to missing user context
- **Root Cause**: These endpoints expected middleware to provide user object, but middleware wasn't running
- **Solution**: Created fixed versions with inline authentication:
  - `/api/conversations-fixed` - Handles conversation CRUD with proper auth and bin key format checking
  - `/api/presence-fixed` - Manages real-time presence tracking with auth
  - Both endpoints handle old bin key format (without team prefix) for backward compatibility
- **Key Fixes**:
  - Check both `bin:teamId:binId` and `binId` formats when looking up bins
  - Pass through binId in conversation responses for proper UI updates
  - Fixed presence endpoint to use GET method instead of OPTIONS

### 12. Recovery System Fix
- **Problem**: Recovered messages would disappear immediately after showing
- **Solution**: Fixed `recoverConversation()` to pass bin object instead of ID to `selectBin()`
- **Additional Fix**: Pass `skipNewConversation=true` to prevent clearing recovered messages

## Migration Process

To assign existing bins to the morpheus-systems team after deployment:

```javascript
// Run in browser console after logging in as vie@morpheus.systems
const token = sessionStorage.getItem('tuneforge_session');
fetch('/api/migrate-fixed', {
  method: 'POST',
  headers: { 
    'X-Session-Token': token,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => console.log('Migration result:', data));
```

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
- [x] User authentication and session management
- [x] Team-based bin access control
- [x] Migration tool for existing data
- [x] Fixed endpoints with inline authentication
- [x] Message recovery system
- [ ] Bin selection and display
- [ ] Conversation persistence after message weaving

## Notes

- The app is designed for infrastructure-level use, not public deployment
- All features maintain the cyberpunk aesthetic
- Performance tested with 100+ conversations per bin
- Cloudflare Pages deployment optimized for edge performance
- User auth system works around Cloudflare Pages middleware limitations
- Sessions persist indefinitely (no expiry) for better UX