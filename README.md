# Maestro

A multi-agent orchestration platform for AI agents. Deploy any agent type to any interface.

## What is Maestro?

Maestro is infrastructure for running AI agents. It handles the hard parts—routing, memory, tools, observability—so you can focus on what your agents do.

- **Multi-agent orchestration**: Route requests to specialized agents (coder, assistant, researcher)
- **Channel abstraction**: One agent, many interfaces (Telegram, CLI, REST API)
- **Persistent memory**: Conversations survive restarts via SQLite
- **Tool system**: Give agents capabilities (calculator, datetime, custom tools)
- **Observability**: Structured logging, token tracking, cost estimation

## Quick Start

### Prerequisites

- Node.js 22+
- Anthropic API key

### Local Development

```bash
# Clone and install
git clone https://github.com/MaestroAgent/maestro.git
cd maestro
npm install

# Configure
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Run CLI
npm run cli

# Or run Telegram bot
npm run dev

# Or run REST API
npm run api
```

### Docker Deployment

```bash
# Create .env file
cp .env.example .env
# Edit .env with your keys

# Build and run
docker compose up -d --build

# View logs
docker compose logs -f
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CHANNELS                              │
│              [Telegram]  [CLI]  [REST API]                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                      ORCHESTRATOR                            │
│              Routes requests to specialized agents           │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                         AGENTS                               │
│         [Personal Assistant]  [Coder]  [+ Custom]            │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    INFRASTRUCTURE                            │
│        [Memory/SQLite]  [Tools]  [Observability]             │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

Agents are configured via YAML files in `config/`:

```yaml
# config/personal-assistant.yaml
name: personal-assistant
description: General-purpose assistant

model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0.7
  max_tokens: 4096

system_prompt: |
  You are a helpful personal assistant...

tools:
  - calculator
  - datetime
```

## API Reference

### REST API

```bash
# Chat (streaming)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "sessionId": "user-123"}'

# Chat (JSON response)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "sessionId": "user-123", "stream": false}'

# Get session history
curl http://localhost:3000/chat/user-123

# List agents
curl http://localhost:3000/agents
```

### CLI Commands

```
/help   - Show available commands
/clear  - Clear conversation history
/cost   - Show token usage and estimated cost
/quit   - Exit CLI
```

## Project Structure

```
maestro/
├── config/                 # Agent YAML configurations
│   ├── orchestrator.yaml
│   ├── personal-assistant.yaml
│   └── coder-agent.yaml
├── src/
│   ├── api/               # REST API (Hono)
│   ├── channels/          # Telegram, CLI adapters
│   ├── core/              # Agent runtime, types
│   ├── llm/               # LLM provider (Anthropic)
│   ├── memory/            # SQLite persistence
│   ├── observability/     # Logging, cost tracking
│   └── tools/             # Tool registry, built-ins
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `TELEGRAM_BOT_TOKEN` | For Telegram | Telegram bot token from @BotFather |
| `PORT` | No | API port (default: 3000) |
| `LOG_LEVEL` | No | Logging level (default: info) |

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Lint
npm run lint

# Type check
npm run build
```

## License

MIT
