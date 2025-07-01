# TuneForge

Dataset builder for AI fine-tuning. Build high-quality training datasets through a web interface with multi-model support.

![{46897658-6B8A-4AFE-BE7D-EA444E5344F7}](https://github.com/user-attachments/assets/8dccc3be-ba67-40af-9581-a8824310d0ef)


## Features

- **Multi-Model Support**: OpenAI and Anthropic models
- **Conversation Management**: Build multi-turn dialogues
- **Dataset Export**: JSONL format for fine-tuning
- **Branching Conversations**: Create conversation branches with the Loom navigator
- **Cloudflare Deployment**: Deploy to Cloudflare Pages

## Quick Start

1. Clone and install:
   ```bash
   git clone <repository-url>
   cd tuneforge
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Add your API keys to .env
   ```

3. Start locally:
   ```bash
   npm start
   ```

## Cloudflare Deployment

1. Build for Cloudflare:
   ```bash
   npm run build:cloudflare
   ```

2. Deploy to Cloudflare Pages:
   ```bash
   npx wrangler pages deploy dist
   ```

## License

MIT License

---

**Made by Vie McCoy for Morpheus Systems**
