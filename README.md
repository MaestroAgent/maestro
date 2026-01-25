# Maestro

A multi-agent orchestration platform for AI agents. Deploy any agent type to any interface.

## What is Maestro?

Maestro is infrastructure for running AI agents. It handles the hard parts—routing, memory, tools, observability—so you can focus on what your agents do.

- **Multi-agent orchestration**: Route requests to specialized agents (coder, assistant, researcher)
- **Channel abstraction**: One agent, many interfaces (Telegram, CLI, REST API)
- **Persistent memory**: Conversations survive restarts via SQLite
- **Tool system**: Give agents capabilities (calculator, datetime, Claude Code integration)
- **Project management**: Clone repos, switch between projects, work on multiple codebases
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
│   [Memory/SQLite]  [Tools]  [Projects]  [Observability]      │
└─────────────────────────────────────────────────────────────┘
```

## Features

### Multi-Agent Routing

The orchestrator analyzes requests and delegates to specialized agents:

- **Personal Assistant**: General conversation, questions, planning
- **Coder Agent**: Programming tasks, code execution via Claude Code
- **Dynamic Agents**: Create custom agents through conversation

### Dynamic Agent Creation

Create, configure, and manage agents through natural conversation:

```
You: Create an agent called research-assistant that helps me research topics
Maestro: Created research-assistant. What system prompt should it use?

You: It should search the web, summarize findings, and cite sources
Maestro: Updated system prompt. What tools should it have?

You: Give it calculator and datetime
Maestro: Done. research-assistant is now available.

[Later]
You: Help me research the history of Unix
[Orchestrator routes to research-assistant]
```

Dynamic agents are:
- **Persistent**: Stored in SQLite, survive restarts
- **Immediately available**: No restart required after creation
- **Fully configurable**: System prompt, model, temperature, tools

### Project Management

Work on multiple codebases without cross-contamination:

```
You: Clone https://github.com/myorg/project-a
Bot: Cloned to project-a. This is now your active project.

You: Add a health check endpoint
Bot: [executes via Claude Code] Done. Added /health endpoint.

You: Clone https://github.com/myorg/project-b
Bot: Cloned to project-b. Switched to this project.

You: Switch to project-a
Bot: Switched to project-a.
```

### Claude Code Integration

The coder agent can execute real coding tasks:
- Read and write files
- Run tests and commands
- Create git commits
- Refactor code

### Built-in Tools

| Tool | Description |
|------|-------------|
| `calculator` | Evaluate math expressions |
| `datetime` | Get current time/date with timezone |
| `clone_project` | Clone a git repository |
| `switch_project` | Switch between projects |
| `list_projects` | List all cloned projects |
| `current_project` | Show active project |
| `claude_code` | Execute coding tasks via Claude Code |
| `create_agent` | Create a new dynamic agent |
| `update_agent` | Update agent config (prompt, tools, etc.) |
| `list_agents` | List all available agents |
| `get_agent` | Get full agent details |
| `delete_agent` | Delete a dynamic agent |

## Configuration

### Agent Configuration

**Static agents** are configured via YAML files in `config/`:

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

**Dynamic agents** are created through conversation and stored in SQLite. They have the same configuration options but can be created, updated, and deleted at runtime without restarting the application.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `TELEGRAM_BOT_TOKEN` | For Telegram | Telegram bot token from @BotFather |
| `GITHUB_TOKEN` | For private repos | GitHub classic token with `repo` scope |
| `PORT` | No | API port (default: 3000) |
| `LOG_LEVEL` | No | Logging level (default: info) |

### GitHub Token Setup

To clone private repositories:

1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select the `repo` scope
4. Add to `.env`: `GITHUB_TOKEN=ghp_xxxxx`

This works for all repos you have access to, including organization repos.

## API Reference

### REST API

```bash
# Chat (streaming SSE)
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
├── config/                 # Agent YAML configurations (static agents)
│   ├── orchestrator.yaml
│   ├── personal-assistant.yaml
│   └── coder-agent.yaml
├── src/
│   ├── agents/            # Orchestrator agent
│   ├── api/               # REST API (Hono)
│   ├── channels/          # Telegram, CLI adapters
│   ├── core/              # Agent runtime, types, config, registry
│   ├── llm/               # LLM provider (Anthropic)
│   ├── memory/            # SQLite persistence (sessions + dynamic agents)
│   ├── observability/     # Logging, cost tracking
│   └── tools/             # Tool registry, built-ins
│       └── builtin/       # calculator, datetime, projects, claude-code, agents
├── projects/              # Cloned repositories (gitignored)
├── data/                  # SQLite database (gitignored)
├── logs/                  # Log files (gitignored)
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Deployment

### Docker (Recommended)

```bash
# Build and run both services
docker compose up -d --build

# Run only API
docker compose up -d api

# Run only Telegram bot
docker compose up -d telegram

# View logs
docker compose logs -f

# Restart after updates
git pull && docker compose up -d --build
```

### Direct (Without Docker)

```bash
npm install
npm run build
node dist/index.js          # Telegram bot
node dist/index.js api      # REST API
node dist/index.js cli      # Interactive CLI
```

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Lint
npm run lint
```

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation | ✅ Complete | Agent runtime, CLI, API, tools, memory |
| Phase 2: Channels | 🟡 Partial | Telegram ✅, Slack/Discord planned |
| Phase 3: Orchestration | ✅ Complete | Multi-agent routing, delegation, dynamic agent creation |
| Phase 4: Observability | 🟡 Partial | Logging ✅, Web dashboard planned |

## License

MIT
