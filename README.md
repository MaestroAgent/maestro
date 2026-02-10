<p align="center">
  <img src="assets/brand/enzo.png" alt="Enzo the Maestro Penguin" width="200">
</p>

<h1 align="center">Maestro</h1>

<p align="center">
  <strong>Your AI marketing team</strong>
</p>

<p align="center">
  32 specialized marketing agents that work as a coordinated team. Like having a full marketing department — content writers, SEO specialists, CRO analysts, paid ads managers, social media strategists — available on demand.
</p>

<p align="center">
  <a href="https://maestro.so">Website</a> •
  <a href="./AGENTS.md">Agent Roster</a> •
  <a href="#quick-start">Quick Start</a>
</p>

---

## What is Maestro?

Maestro is a platform of deeply specialized marketing AI agents built on a multi-agent orchestration runtime. Each agent is an expert in its domain — from SEO audits to email deliverability to pricing strategy — and they can consult each other laterally, just like a real marketing team.

- **32 marketing specialists** across 8 categories (content, SEO, CRO, paid, social, email, strategy, growth)
- **Smart routing**: describe what you need, the orchestrator finds the right specialist
- **Agent-to-agent delegation**: any agent can consult any other agent directly
- **Marketing tool integrations**: Google Search Console, GA4, Kit, Stripe
- **Channel abstraction**: CLI, REST API, Telegram, Slack
- **Persistent memory**: conversations survive restarts via SQLite
- **Cost tracking**: per-agent, per-session token spend and budget guards

## Agent Roster

| Category | Agents | Focus |
|----------|--------|-------|
| **Content** | blog-writer, email-sequence, landing-page, social-content, video-script, newsletter-writer | Copy and content creation |
| **SEO** | seo-auditor, keyword-researcher, programmatic-seo, competitor-analyzer | Search visibility and organic growth |
| **CRO** | page-optimizer, signup-flow, onboarding, pricing-strategist | Conversion and monetization |
| **Paid** | campaign-builder, creative-tester, audience-targeter, budget-optimizer | Paid advertising |
| **Social** | reddit-strategist, youtube-optimizer, linkedin-content, twitter-content | Platform-specific social |
| **Email** | sequence-builder, deliverability, segmentation | Email marketing |
| **Strategy** | marketing-strategist, content-calendar, campaign-planner, analytics-interpreter | Planning and analysis |
| **Growth** | referral-program, free-tool-strategy, viral-loop | Growth engineering |

See [AGENTS.md](./AGENTS.md) for detailed descriptions and trigger phrases.

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
│                    32 MARKETING AGENTS                        │
│   [Content]  [SEO]  [CRO]  [Paid]  [Social]  [Email]       │
│              [Strategy]  [Growth]                             │
│         ↕ agents consult each other laterally ↕              │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    INFRASTRUCTURE                            │
│  [Memory/SQLite]  [Tools]  [Marketing Integrations]         │
│  [Cost Tracking]  [References]  [Observability]             │
└─────────────────────────────────────────────────────────────┘
```

### Flat Agent Architecture

Agents are peers, not a hierarchy. The orchestrator's only job is initial routing. After that:

- Any agent can delegate to any other agent via `delegate_to_agent`
- Users can talk to any agent directly (bypass orchestrator if they know what they need)
- No bottleneck — agents consult each other as needed

## Marketing Tool Integrations

| Tool | Purpose | Used By |
|------|---------|---------|
| Google Search Console | SEO data, search analytics | seo-auditor, keyword-researcher |
| Google Analytics (GA4) | Traffic, conversions, user behavior | analytics-interpreter, page-optimizer |
| Kit (ConvertKit) | Email subscribers, sequences, tags | email-sequence, sequence-builder |
| Stripe | Revenue, subscriptions, churn | pricing-strategist, analytics-interpreter |

Configure via environment variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required) |
| `GSC_SERVICE_ACCOUNT_KEY` | Google Search Console service account JSON |
| `GA4_SERVICE_ACCOUNT_KEY` | Google Analytics service account JSON |
| `GA4_PROPERTY_ID` | GA4 property ID |
| `KIT_API_SECRET` | Kit (ConvertKit) API secret |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `DAILY_BUDGET_LIMIT` | Maximum daily API cost in USD |
| `MONTHLY_BUDGET_LIMIT` | Maximum monthly API cost in USD |

## Project Structure

```
maestro/
├── agents/                    # 32 marketing agent YAML definitions
│   ├── orchestrator.yaml      # Marketing-focused router
│   ├── content/               # Blog, email, landing page, social, video, newsletter
│   ├── seo/                   # Auditor, keywords, programmatic, competitor
│   ├── cro/                   # Page optimizer, signup, onboarding, pricing
│   ├── paid/                  # Campaigns, creative, audiences, budget
│   ├── social/                # Reddit, YouTube, LinkedIn, Twitter
│   ├── email/                 # Sequences, deliverability, segmentation
│   ├── strategy/              # Strategist, calendar, campaigns, analytics
│   └── growth/                # Referral, free tools, viral loops
├── references/                # Deep reference docs loaded on demand
│   ├── content/               # Copy frameworks, email templates, headlines
│   ├── seo/                   # Audit checklist, programmatic playbooks, schema
│   └── cro/                   # Experiment library, pricing models
├── src/
│   ├── agents/                # Agent runtime
│   ├── api/                   # REST API (Hono)
│   ├── channels/              # Telegram, CLI adapters
│   ├── core/                  # Agent runtime, types, config, registry
│   ├── llm/                   # LLM provider (Anthropic)
│   ├── memory/                # SQLite persistence
│   ├── observability/         # Logging, cost tracking
│   └── tools/                 # Tool registry + marketing integrations
├── config/                    # Runtime config + archived agents
├── docker-compose.yml
└── AGENTS.md                  # Full agent roster documentation
```

## API Reference

### REST API

```bash
# Chat (streaming SSE)
curl -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer msk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"message": "Run an SEO audit on my site", "sessionId": "user-123"}'

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

See [AGENTS.md](./AGENTS.md) for how agent YAML files are structured and how to contribute new agents.

## Acknowledgments

- **Marketing Agent**: Originally built on frameworks from [Marketing Skills for Claude Code](https://github.com/coreyhaines31/marketingskills) by [Corey Haines](https://github.com/coreyhaines31).

## License

MIT
