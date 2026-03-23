# CLAUDE.md

## Project: Maestro
AI-native RevOps platform with 37+ specialized agents (sales + marketing).

## Tech Stack
- TypeScript (strict mode), ESM modules, Node.js 22+
- Runtime: Hono (API), Grammy (Telegram), Bolt (Slack)
- Database: better-sqlite3 (SQLite)
- Build: `npm run build` (tsc)
- Lint: `npm run lint` (ESLint with typescript-eslint)
- Format: `npm run format` (Prettier)
- Test: `npm run test` (Vitest)

## Quality Gates
Before every commit, ALL of these must pass:
1. `npm run lint` -- zero errors
2. `npm run build` -- zero TypeScript errors
3. `npm run test` -- all tests pass

If any gate fails, fix it before committing. Never skip.

## Code Conventions
- ESM imports with .js extensions in relative paths
- Strict TypeScript: noUnusedLocals, noUnusedParameters, noImplicitReturns
- Double quotes, semicolons, trailing commas (es5), 2-space indent (per .prettierrc)
- Prefer editing existing files over creating new ones
- Delete dead code, don't comment it out
- Comments explain WHY, not WHAT

## Project Structure
```
src/
  agents/        - Orchestrator and agent runtime logic
  api/           - REST API (Hono) with routes and middleware
  channels/      - Interface adapters (Telegram, CLI, Slack)
  core/          - Runtime, types, config, registry
  crm/           - CRM data layer (contacts, companies, deals)
  llm/           - LLM provider abstraction
  memory/        - Persistence (SQLite)
  observability/ - Logging, cost tracking
  tools/         - Tool system and built-in tools
agents/          - YAML agent definitions by category
references/      - Deep reference docs loaded by agents
tests/           - Vitest test files
```

## Testing
- Framework: Vitest (`npm run test`)
- Tests live in /tests directory
- Mock external systems, never mock the module under test
- One logical assertion per test

## Git Conventions
- One logical change per commit
- Descriptive commit messages (imperative mood)
