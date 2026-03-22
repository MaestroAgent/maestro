<p align="center">
  <img src="assets/brand/enzo.png" alt="Enzo the Maestro Penguin" width="200">
</p>

<h1 align="center">Maestro</h1>

<p align="center">
  <strong>Open-source AI revenue operations</strong>
</p>

<p align="center">
  An AI-native RevOps platform — sales and marketing agents that work as a coordinated team. Like having a full revenue operations department available on demand.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>
</p>

---

## What is Maestro?

Maestro is an open-source platform of specialized AI agents for revenue operations, built on a multi-agent orchestration runtime. Each agent is an expert in its domain — from pipeline management to content creation to lead qualification — and they can consult each other laterally, just like a real team.

- **Smart routing**: describe what you need, the orchestrator finds the right specialist
- **Agent-to-agent delegation**: any agent can consult any other agent directly
- **Built-in CRM**: contacts, companies, deals, and pipeline managed directly in SQLite
- **Channel abstraction**: CLI, REST API, Telegram, Slack
- **Persistent memory**: conversations and CRM data survive restarts via SQLite
- **Cost tracking**: per-agent, per-session token spend and budget guards

## Quick Start

### Prerequisites

- Node.js 22+
- Anthropic API key

### Docker (Recommended)

```bash
git clone https://github.com/founderlevel/maestro.git
cd maestro

cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

docker compose up -d --build
```

### Local Development

```bash
git clone https://github.com/founderlevel/maestro.git
cd maestro
npm install

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
│              [Telegram]  [CLI]  [REST API]  [Slack]          │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                      ORCHESTRATOR                            │
│              Routes requests to the right specialist          │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                     REVOPS AGENTS                            │
│        [Sales]  [Marketing]  [Ops]  [Strategy]              │
│         ↕ agents consult each other laterally ↕              │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    INFRASTRUCTURE                            │
│  [CRM/SQLite]  [Tools]  [Memory]  [Integrations]           │
│  [Cost Tracking]  [References]  [Observability]             │
└─────────────────────────────────────────────────────────────┘
```

### Flat Agent Architecture

Agents are peers, not a hierarchy. The orchestrator's only job is initial routing. After that:

- Any agent can delegate to any other agent via `delegate_to_agent`
- Users can talk to any agent directly (bypass orchestrator if they know what they need)
- No bottleneck — agents consult each other as needed

## Project Structure

```
maestro/
├── agents/                    # Agent YAML definitions
│   ├── orchestrator.yaml      # RevOps-focused router
│   ├── sales/                 # Pipeline, prospecting, deal coaching
│   ├── marketing/             # Content, SEO, email, campaigns
│   ├── ops/                   # Data, integrations, automation
│   └── strategy/              # Forecasting, analytics, planning
├── references/                # Deep reference docs loaded on demand
├── src/
│   ├── agents/                # Agent runtime
│   ├── api/                   # REST API (Hono)
│   ├── channels/              # Telegram, CLI, Slack adapters
│   ├── core/                  # Agent runtime, types, config, registry
│   ├── llm/                   # LLM provider (Anthropic)
│   ├── memory/                # SQLite persistence
│   ├── observability/         # Logging, cost tracking
│   └── tools/                 # Tool registry + integrations
├── config/                    # Runtime config + archived agents
├── docker-compose.yml
└── README.md
```

## API Reference

### REST API

```bash
# Chat (streaming SSE)
curl -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer msk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"message": "Show me the deal pipeline", "sessionId": "user-123"}'

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

## Contributing

Agent definitions are YAML files in `agents/`. See existing agents for the schema.

## License

MIT
