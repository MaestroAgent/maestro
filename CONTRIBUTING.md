# Contributing to Maestro

Thank you for your interest in contributing to Maestro! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/maestro.git`
3. Install dependencies: `npm install`
4. Copy environment config: `cp .env.example .env`
5. Add your `ANTHROPIC_API_KEY` to `.env`

## Development

```bash
# Run CLI in development mode
npm run cli

# Run API server
npm run api

# Run with file watching
npm run dev

# Lint code
npm run lint

# Format code
npm run format

# Build TypeScript
npm run build
```

## Pull Request Process

1. Create a feature branch from `main`: `git checkout -b feature/your-feature`
2. Make your changes
3. Run linting: `npm run lint`
4. Run the build: `npm run build`
5. Commit with a clear message describing the change
6. Push to your fork and open a pull request

### PR Guidelines

- Keep changes focused - one feature or fix per PR
- Update documentation if adding new features
- Add entries to CHANGELOG.md for notable changes
- Ensure CI passes before requesting review

## Code Style

- We use TypeScript with strict mode
- ESLint and Prettier are configured - run `npm run lint` and `npm run format`
- Follow existing patterns in the codebase
- Keep functions small and focused
- Use meaningful variable and function names

## Project Structure

```
src/
├── agents/       # Orchestrator and agent logic
├── api/          # REST API (Hono)
├── channels/     # Interface adapters (Telegram, CLI, Slack)
├── core/         # Runtime, types, config, registry
├── llm/          # LLM providers
├── memory/       # Persistence (SQLite)
├── observability/# Logging, cost tracking
└── tools/        # Tool system and built-in tools
```

## Adding New Features

### Adding a New Tool

1. Create a file in `src/tools/builtin/`
2. Export a `ToolDefinition` with name, description, parameters, and execute function
3. Register it in `src/tools/builtin/index.ts`

### Adding a New Channel

1. Create a directory in `src/channels/`
2. Implement the channel adapter following existing patterns (see `telegram/` or `cli/`)
3. Add a startup script in `package.json`

### Adding a New Agent

Create a YAML file in `config/` following the existing format:

```yaml
name: your-agent
description: What this agent does

model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0.7
  max_tokens: 4096

system_prompt: |
  Your agent's system prompt...

tools:
  - calculator
  - datetime
```

## Reporting Issues

- Use GitHub Issues for bugs and feature requests
- Include reproduction steps for bugs
- Check existing issues before creating duplicates

## Questions?

Open a GitHub Discussion or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
