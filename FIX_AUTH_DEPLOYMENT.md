# Fix Authentication Deployment Guide

## Problem
The authentication system is broken because the required KV namespaces are not configured in Cloudflare.

## Root Cause
The auth system was migrated from a single password to user accounts, but the KV namespaces needed for storing users, sessions, and teams were never created in Cloudflare.

## Solution

### 1. Create Missing KV Namespaces in Cloudflare Dashboard

Go to your Cloudflare dashboard and create these KV namespaces:

1. **USERS** - Stores user accounts
2. **SESSIONS** - Stores active sessions  
3. **TEAMS** - Stores team information
4. **PRESENCE** - Stores real-time presence data

### 2. Update wrangler.toml

Replace the placeholder IDs in wrangler.toml with your actual KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "USERS"
id = "your-actual-users-namespace-id"
preview_id = "your-actual-users-preview-id"

[[kv_namespaces]]
binding = "SESSIONS"
id = "your-actual-sessions-namespace-id"
preview_id = "your-actual-sessions-preview-id"

[[kv_namespaces]]
binding = "TEAMS"
id = "your-actual-teams-namespace-id"
preview_id = "your-actual-teams-preview-id"

[[kv_namespaces]]
binding = "PRESENCE"
id = "your-actual-presence-namespace-id"
preview_id = "your-actual-presence-preview-id"
```

### 3. Deploy to Cloudflare

```bash
npm run build
npx wrangler pages deploy dist/
```

### 4. Create Initial Admin User (Optional)

If you want to pre-create an admin user, run this in the Cloudflare dashboard's KV editor:

Key: `user:vie@morpheus.systems`
Value:
```json
{
  "id": "admin-001",
  "email": "vie@morpheus.systems",
  "teamId": "morpheus-systems",
  "role": "admin",
  "isFirstLogin": true,
  "createdAt": "2025-01-01T00:00:00Z"
}
```

## Session Management Details

- **Multi-User Support**: YES - Each user gets a unique session token
- **Session Storage**: Sessions are stored in KV with format `session:{token}`
- **Session Expiry**: Sessions persist indefinitely (no expiry)
- **Concurrent Users**: Fully supported - no conflicts between users
- **Team Isolation**: Users can only see bins from their team

## Authentication Flow

1. User enters email
2. System checks if user exists
3. If new morpheus.systems user → auto-create account
4. User sets/enters password
5. Session token created and stored in:
   - KV storage (server-side)
   - sessionStorage (client-side)
   - Sent via X-Session-Token header

## Testing

After deployment, test login with:
- Email: vie@morpheus.systems
- First login will prompt to create password
- Check browser console for any errors
- Verify session token is stored in sessionStorage