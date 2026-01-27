<p align="center">
  <img src="assets/brand/enzo.png" alt="Enzo the Maestro Penguin" width="200">
</p>

<h1 align="center">Maestro</h1>

<p align="center">
  <strong>Orchestrate your AI agents</strong>
</p>

<p align="center">
  Deploy any agent to any interface. Maestro handles routing, memory, tools, and observability — so you can focus on what your agents do.
</p>

<p align="center">
  <a href="https://maestro.is">Website</a> •
  <a href="https://maestro.is/getting-started/introduction">Documentation</a> •
  <a href="https://maestro.is/getting-started/quickstart">Quick Start</a>
</p>

---

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

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/MaestroAgent/maestro.git
cd maestro

# Configure
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Build and run
docker compose up -d --build
```

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
│    [Personal Assistant]  [Coder]  [Marketing]  [+ Custom]    │
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
- **Marketing Agent**: CRO, copywriting, SEO, paid ads, analytics, and growth
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
| `DAILY_BUDGET_LIMIT` | No | Maximum daily API cost in USD |
| `MONTHLY_BUDGET_LIMIT` | No | Maximum monthly API cost in USD |

## Security

### API Authentication

The REST API requires API key authentication by default. Generate keys using the admin interface or seed via environment variable:

```bash
# Set a pre-generated API key (format: msk_<64 hex chars>)
MAESTRO_API_KEY=msk_abc123...

# Disable auth for development only (NOT recommended for production)
MAESTRO_API_AUTH_ENABLED=false
```

Pass the API key in requests:
```bash
curl http://localhost:3000/chat \
  -H "Authorization: Bearer msk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

### Breaking Changes (v0.2.0)

**Dashboard Authentication Required**

The `/dashboard` route now requires API key authentication. Previously it was publicly accessible.

**Migration:**
- Ensure API key is passed when accessing dashboard
- For development, set `MAESTRO_API_AUTH_ENABLED=false` to disable auth (not for production)

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

## Documentation

Full documentation is available at [maestro.is](https://maestro.is):

- [Introduction](https://maestro.is/getting-started/introduction)
- [Quick Start](https://maestro.is/getting-started/quickstart)
- [Configuration](https://maestro.is/getting-started/configuration)
- [Architecture](https://maestro.is/concepts/architecture)
- [Creating Agents](https://maestro.is/guides/creating-agents)
- [API Reference](https://maestro.is/reference/api)

## Project Structure

```
maestro/
├── config/                 # Agent YAML configurations (static agents)
├── src/
│   ├── agents/            # Orchestrator agent
│   ├── api/               # REST API (Hono)
│   ├── channels/          # Telegram, CLI adapters
│   ├── core/              # Agent runtime, types, config, registry
│   ├── llm/               # LLM provider (Anthropic)
│   ├── memory/            # SQLite persistence (sessions + dynamic agents)
│   ├── observability/     # Logging, cost tracking
│   └── tools/             # Tool registry, built-ins
├── assets/brand/          # Brand assets (Enzo, logos)
├── projects/              # Cloned repositories (gitignored)
├── data/                  # SQLite database (gitignored)
└── logs/                  # Log files (gitignored)
```

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation | Done | Agent runtime, CLI, API, tools, memory |
| Phase 2: Channels | Partial | Telegram done, Slack/Discord planned |
| Phase 3: Orchestration | Done | Multi-agent routing, dynamic agent creation |
| Phase 4: Observability | Partial | Logging done, web dashboard planned |

## Acknowledgments

- **Marketing Agent**: Built on frameworks from [Marketing Skills for Claude Code](https://github.com/coreyhaines31/marketingskills) by [Corey Haines](https://github.com/coreyhaines31) - an excellent collection of 23 marketing skills for CRO, copywriting, SEO, and growth strategy.

## License

MIT
