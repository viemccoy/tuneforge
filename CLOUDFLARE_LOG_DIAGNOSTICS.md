# Cloudflare Log Diagnostics Guide for TuneForge Message Loss

## Quick Search Commands

Use these search patterns in Cloudflare dashboard or `wrangler tail`:

```bash
# Find all conversation save errors
"conversation_create_error" OR "conversation_update_error"

# Find authentication failures during saves
"status\":401" AND ("conversation_create" OR "conversation_update")

# Find rate limiting issues
"status\":429" OR "Rate limit exceeded"

# Find validation failures
"Invalid conversation data" OR "hasMessages\":false"

# Find missing conversations
"conversation_update_not_found"

# Track specific user's save attempts
"binId\":\"USER_BIN_ID_HERE\""
```

## Critical Log Events to Monitor

### 1. Save Operation Failures

| Event | Description | Search Pattern |
|-------|-------------|----------------|
| `conversation_create_error` | New conversation failed to save | Contains error message and stack trace |
| `conversation_update_error` | Existing conversation update failed | Check conversationId and error |
| `conversation_update_not_found` | Conversation missing during update | Indicates data loss or sync issues |

### 2. Data Validation Issues

Look for these validation failures:
- `hasBinId: false` - Missing bin ID
- `hasMessages: false` - No messages in request
- `isMessagesArray: false` - Messages not an array
- `messageCount: 0` - Empty message array

### 3. Timing/Race Conditions

Search for rapid successive requests:
```
Sort by timestamp and look for:
- Multiple PUT requests to same conversationId within 5 seconds
- POST followed immediately by PUT to same conversation
- Overlapping save operations from same user
```

## Root Cause Analysis Steps

### Step 1: Find Failed Saves
```
1. Search: "conversation_*_error"
2. Note the timestamp, conversationId, and error message
3. Check the binId and messageCount
```

### Step 2: Trace User Session
```
1. Get binId from error log
2. Search all logs with that binId in 30-minute window
3. Look for pattern:
   - Successful creates/updates before failure
   - Authentication status changes
   - Rate limiting hits
```

### Step 3: Check for Data Loss
```
1. Search: "conversation_update_not_found" 
2. Cross-reference with "conversation_create_success" for same ID
3. If created but later "not found", data was lost
```

## Common Failure Patterns

### Pattern 1: Silent Save Failures
- **Symptom**: User thinks conversation saved but it didn't
- **Cause**: Frontend only shows generic alert, user might miss it
- **Log signature**: `conversation_*_error` with no retry attempts

### Pattern 2: Session Timeout During Long Conversation
- **Symptom**: Save fails after hours of work
- **Cause**: 24-hour session expires
- **Log signature**: `status: 401` after successful operations

### Pattern 3: Rate Limit During Rapid Edits
- **Symptom**: Some saves work, others fail silently
- **Cause**: 30 requests/minute limit exceeded
- **Log signature**: `status: 429` or rate limit errors

### Pattern 4: Concurrent Edit Conflicts
- **Symptom**: Latest changes lost
- **Cause**: Multiple tabs or rapid regenerations
- **Log signature**: Overlapping PUT requests to same conversation

## Preventive Monitoring

Set up alerts for:
1. Any `conversation_*_error` event
2. HTTP 401/429 responses on conversation endpoints
3. Multiple failed saves from same binId within 5 minutes
4. `conversation_update_not_found` events

## Recovery Data

Check for recovery attempts:
- Frontend stores pending messages in `sessionStorage`
- Look for recovery data in subsequent successful saves
- Compare messageCount between failed and next successful save

## Recommended Fixes

1. **Add retry logic** for failed saves with exponential backoff
2. **Improve error visibility** - modal instead of alert
3. **Implement auto-save** with conflict resolution
4. **Add save status indicator** in UI
5. **Create backup queue** for failed saves
6. **Add unique request IDs** for better tracking