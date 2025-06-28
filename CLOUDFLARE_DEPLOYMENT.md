# TuneForge Cloudflare Pages Deployment Guide

## Overview

TuneForge has been restructured to work on Cloudflare Pages with the following features:
- **Bin-based organization**: Each system prompt creates a dataset "bin"
- **Password protection**: Simple auth for infrastructure-only access
- **KV storage**: Persistent storage for bins and conversations
- **Serverless functions**: API endpoints running on Cloudflare's edge network

## Setup Instructions

### 1. Prerequisites
- Cloudflare account
- Wrangler CLI installed: `npm install -g wrangler`

### 2. Create KV Namespaces

```bash
# Create KV namespaces for bins and conversations
wrangler kv:namespace create "BINS"
wrangler kv:namespace create "CONVERSATIONS"

# For preview/development
wrangler kv:namespace create "BINS" --preview
wrangler kv:namespace create "CONVERSATIONS" --preview
```

Update the IDs in `wrangler.toml` with the returned values.

### 3. Configure Environment Variables

In your Cloudflare Pages project settings, add:

```
AUTH_PASSWORD=your-secure-password
OPENAI_API_KEY=sk-proj-your-key
ANTHROPIC_API_KEY=your-anthropic-key (optional)
```

### 4. Deploy

```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages
npm run deploy

# Or manually
wrangler pages deploy dist
```

## Architecture Changes

### Frontend
- **Authentication**: Password-based auth modal on load
- **Bin Management**: Create, select, and delete dataset bins
- **Conversation Storage**: All conversations saved to selected bin
- **Export**: Download entire bin as JSONL file

### Backend (Edge Functions)
- `/api/auth` - Password authentication
- `/api/bins` - CRUD operations for bins
- `/api/conversations` - Manage conversations within bins
- `/api/generate` - AI response generation
- `/api/export` - Export bin as JSONL
- `/api/websocket` - Real-time features (Durable Objects)

### Data Structure

**Bins** (KV namespace: BINS)
```json
{
  "id": "hash-based-id",
  "name": "Customer Support Agent",
  "systemPrompt": "You are a helpful...",
  "description": "Dataset for...",
  "createdAt": "2024-06-26T...",
  "conversationCount": 42,
  "lastUpdated": "2024-06-26T..."
}
```

**Conversations** (KV namespace: CONVERSATIONS)
- Key format: `{binId}:{conversationId}`
```json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "metadata": {
    "createdAt": "2024-06-26T...",
    "model": "gpt-4o",
    "turnCount": 3
  }
}
```

## Usage

1. **Access the app** - Navigate to your Cloudflare Pages URL
2. **Authenticate** - Enter the password you set in environment variables
3. **Create a bin** - Click "+ NEW" and define a system prompt
4. **Start conversations** - Select models and begin chatting
5. **Save conversations** - Click "SAVE TO DATASET" after each conversation
6. **Export dataset** - Click "EXPORT" to download the bin as JSONL

## UI Features

- **Matrix-inspired design**: Green-on-black terminal aesthetic maintained
- **Keyboard navigation**: Arrow keys to navigate AI responses
- **Real-time updates**: Conversation counts update automatically
- **Bin switching**: Quickly switch between different dataset projects
- **Batch operations**: Export entire bins at once

## Security

- Password protection at the edge (no user accounts needed)
- All API routes protected by middleware
- Session cookies for authenticated sessions
- Environment variables for sensitive data

## Development

For local development with Cloudflare Pages:

```bash
# Install dependencies
npm install

# Run locally with Wrangler
wrangler pages dev dist

# Or use the original server for local testing
npm run dev
```

## Notes

- WebSocket functionality uses Durable Objects (requires paid Cloudflare plan)
- KV storage has eventual consistency (usually within seconds)
- Export files follow OpenAI fine-tuning format
- Each bin maintains its own system prompt and conversations