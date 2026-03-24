import "dotenv/config";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadAllAgentConfigs, loadAgentConfigsRecursive } from "./core/config.js";
import { AgentContext } from "./core/types.js";
import { ToolRegistry, AgentServices } from "./core/agent.js";
import { DynamicAgentRegistry } from "./core/registry.js";
import { AnthropicProvider } from "./llm/anthropic.js";
import { createOrchestratorAgent } from "./agents/orchestrator.js";
import { TelegramAdapter } from "./channels/telegram.js";
import { SlackAdapter } from "./channels/slack.js";
import { CLIAdapter } from "./channels/cli.js";
import { ChannelEngine } from "./channels/engine.js";
import { MemoryStore } from "./memory/store.js";
import { createToolRegistry, builtinTools, marketingTools, crmTools } from "./tools/index.js";
import { initLogger, initBudgetGuard, getLogger, getBudgetGuard, getCostTracker } from "./observability/index.js";
import { initVectorStore, getVectorStore } from "./memory/index.js";
import { MaestroDatabase } from "./core/database.js";
import {
  initCrmSchema,
  CompanyRepo,
  ContactRepo,
  ActivityRepo,
  PipelineRepo,
  DealRepo,
} from "./crm/index.js";
import type { CrmServices } from "./crm/index.js";
import { APIServer } from "./api/index.js";
import { hashApiKey, isValidKeyFormat } from "./api/utils/auth.js";
import { checkAllowlistConfiguration } from "./channels/utils/allowlist.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "config");
const AGENTS_DIR = join(__dirname, "..", "agents");
const DATA_DIR = join(__dirname, "..", "data");
const LOGS_DIR = join(__dirname, "..", "logs");

type Mode = "telegram" | "slack" | "cli" | "api";

function getMode(): Mode {
  const arg = process.argv[2];
  if (arg === "--cli" || arg === "cli") {
    return "cli";
  }
  if (arg === "--api" || arg === "api") {
    return "api";
  }
  if (arg === "--slack" || arg === "slack") {
    return "slack";
  }
  return "telegram";
}

function validateEnv(mode: Mode): void {
  const required = ["ANTHROPIC_API_KEY"];

  if (mode === "telegram") {
    required.push("TELEGRAM_BOT_TOKEN");
  }

  if (mode === "slack") {
    required.push("SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_SIGNING_SECRET");
  }

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Please create a .env file based on .env.example");
    process.exit(1);
  }
}

interface AppContext {
  database: MaestroDatabase;
  agentRegistry: DynamicAgentRegistry;
  provider: AnthropicProvider;
  toolRegistry: ToolRegistry;
  memoryStore: MemoryStore;
  crm: CrmServices;
  createOrchestrator: (
    context: AgentContext
  ) => ReturnType<typeof createOrchestratorAgent>;
}

function setupApp(mode: Mode): AppContext {
  // Initialize logger
  initLogger({
    level:
      (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ?? "info",
    logFile: join(LOGS_DIR, "maestro.jsonl"),
    console: mode === "cli" ? false : true, // Suppress console in CLI mode
  });

  // Check allowlist configuration and warn about missing settings
  checkAllowlistConfiguration();

  // Load agent configs from agents/ directory (recursive, by category)
  console.log("Loading agent configurations...");
  const staticAgentConfigs = loadAgentConfigsRecursive(AGENTS_DIR);

  // Also load any remaining configs from config/ (backward compat)
  const legacyConfigs = loadAllAgentConfigs(CONFIG_DIR);
  for (const [name, config] of legacyConfigs) {
    if (!staticAgentConfigs.has(name)) {
      staticAgentConfigs.set(name, config);
    }
  }

  console.log(
    `Loaded ${staticAgentConfigs.size} static agent(s): ${[...staticAgentConfigs.keys()].join(", ")}`
  );

  // Create LLM provider
  const provider = new AnthropicProvider();

  // Create tool registry and register built-in + marketing + CRM tools
  const tools = createToolRegistry();
  tools.registerAll(builtinTools);
  tools.registerAll(marketingTools);
  tools.registerAll(crmTools);
  console.log(
    `Registered ${tools.list().length} tool(s): ${tools.list().join(", ")}`
  );
  const toolRegistry = tools.registry;

  // Initialize shared database connection
  const database = new MaestroDatabase(join(DATA_DIR, "maestro.db"));

  // Initialize CRM
  initCrmSchema(database.db);
  const activityRepo = new ActivityRepo(database.db);
  const pipelineRepo = new PipelineRepo(database.db);
  const crm: CrmServices = {
    companies: new CompanyRepo(database.db),
    contacts: new ContactRepo(database.db),
    deals: new DealRepo(database.db, activityRepo, pipelineRepo),
    activities: activityRepo,
    pipeline: pipelineRepo,
  };
  console.log("CRM initialized");

  // Create memory store
  const memoryStore = new MemoryStore(database.db, {
    maxMessages: 100,
  });

  // Seed API key from environment variable if set and no keys exist
  const seedApiKey = process.env.MAESTRO_API_KEY;
  if (seedApiKey && !memoryStore.hasApiKeys()) {
    if (isValidKeyFormat(seedApiKey)) {
      const keyHash = hashApiKey(seedApiKey);
      const keyPrefix = seedApiKey.slice(0, 12);
      memoryStore.createApiKey("Default API Key", keyHash, keyPrefix);
      console.log(`API key seeded from MAESTRO_API_KEY (prefix: ${keyPrefix})`);
    } else {
      console.warn(
        "MAESTRO_API_KEY is set but has invalid format (expected: msk_<64 hex chars>)"
      );
    }
  }

  // Create dynamic agent registry (merges static + SQLite agents)
  const agentRegistry = new DynamicAgentRegistry(
    staticAgentConfigs,
    memoryStore
  );
  const dynamicAgents = memoryStore.getAllAgents();
  if (dynamicAgents.length > 0) {
    console.log(
      `Loaded ${dynamicAgents.length} dynamic agent(s): ${dynamicAgents.map((a) => a.name).join(", ")}`
    );
  }

  // Initialize budget guard
  const dailyBudget = parseFloat(process.env.DAILY_BUDGET_USD ?? "20");
  initBudgetGuard(database.db, {
    dailyLimitUsd: dailyBudget,
  });
  console.log(`Budget guard initialized: $${dailyBudget}/day limit`);

  // Initialize vector store for semantic memory
  initVectorStore({
    db: database.db,
  });
  console.log("Semantic memory initialized");

  // Get orchestrator config
  const orchestratorConfig = staticAgentConfigs.get("orchestrator");
  if (!orchestratorConfig) {
    throw new Error("Orchestrator config not found");
  }

  // Factory function to create orchestrator with fresh dynamic prompt each time
  const createOrchestrator = (context: AgentContext) => {
    const services: AgentServices = {
      logger: getLogger(),
      costTracker: getCostTracker(context.sessionId, orchestratorConfig.model.name),
      budgetGuard: getBudgetGuard() ?? undefined,
      crm,
      vectorStore: getVectorStore() ?? undefined,
    };
    return createOrchestratorAgent(
      orchestratorConfig,
      provider,
      agentRegistry,
      toolRegistry,
      services,
      context
    );
  };

  return {
    database,
    agentRegistry,
    provider,
    toolRegistry,
    memoryStore,
    crm,
    createOrchestrator,
  };
}

async function runTelegram(app: AppContext): Promise<void> {
  const engine = new ChannelEngine(app.createOrchestrator, app.memoryStore);
  const telegram = new TelegramAdapter({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    engine,
    memoryStore: app.memoryStore,
  });

  // Handle shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    telegram.stop();
    app.database.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the bot
  console.log("Starting Maestro Telegram bot...");
  await telegram.start();
}

async function runSlack(app: AppContext): Promise<void> {
  const engine = new ChannelEngine(app.createOrchestrator, app.memoryStore);
  const slack = new SlackAdapter({
    botToken: process.env.SLACK_BOT_TOKEN!,
    appToken: process.env.SLACK_APP_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    engine,
    memoryStore: app.memoryStore,
    agentRegistry: app.agentRegistry,
  });

  // Handle shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await slack.stop();
    app.database.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await slack.start();
}

async function runCLI(app: AppContext): Promise<void> {
  const engine = new ChannelEngine(app.createOrchestrator, app.memoryStore);
  const cli = new CLIAdapter({
    engine,
    memoryStore: app.memoryStore,
  });

  // Check for pipe mode
  try {
    if (CLIAdapter.isPipeMode()) {
      await cli.runPipeMode();
    } else {
      await cli.startInteractive();
    }
  } finally {
    app.database.close();
  }
}

async function runAPI(app: AppContext): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3000", 10);

  const apiServer = new APIServer({
    port,
    createOrchestrator: app.createOrchestrator,
    memoryStore: app.memoryStore,
    agentRegistry: app.agentRegistry,
    crm: app.crm,
    logFile: join(LOGS_DIR, "maestro.jsonl"),
    dashboardPath: join(__dirname, "..", "dashboard", "dist"),
  });

  // Handle shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    apiServer.stop();
    app.database.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  apiServer.start();
}

async function main(): Promise<void> {
  const mode = getMode();

  // Validate environment
  validateEnv(mode);

  // Setup shared components
  const app = setupApp(mode);

  // Run in selected mode
  if (mode === "cli") {
    await runCLI(app);
  } else if (mode === "api") {
    await runAPI(app);
  } else if (mode === "slack") {
    await runSlack(app);
  } else {
    await runTelegram(app);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
