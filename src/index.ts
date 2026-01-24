import "dotenv/config";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadAllAgentConfigs } from "./core/config.js";
import { AgentContext } from "./core/types.js";
import { AgentRegistry, ToolRegistry } from "./core/agent.js";
import { AnthropicProvider } from "./llm/anthropic.js";
import { createOrchestratorAgent } from "./agents/orchestrator.js";
import { TelegramAdapter } from "./channels/telegram.js";
import { CLIAdapter } from "./channels/cli.js";
import { MemoryStore } from "./memory/store.js";
import { createToolRegistry, builtinTools } from "./tools/index.js";
import { initLogger } from "./observability/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "config");
const DATA_DIR = join(__dirname, "..", "data");
const LOGS_DIR = join(__dirname, "..", "logs");

type Mode = "telegram" | "cli";

function getMode(): Mode {
  const arg = process.argv[2];
  if (arg === "--cli" || arg === "cli") {
    return "cli";
  }
  return "telegram";
}

function validateEnv(mode: Mode): void {
  const required = ["ANTHROPIC_API_KEY"];

  if (mode === "telegram") {
    required.push("TELEGRAM_BOT_TOKEN");
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
  agentConfigs: AgentRegistry;
  provider: AnthropicProvider;
  toolRegistry: ToolRegistry;
  memoryStore: MemoryStore;
  createOrchestrator: (context: AgentContext) => ReturnType<typeof createOrchestratorAgent>;
}

function setupApp(mode: Mode): AppContext {
  // Initialize logger
  initLogger({
    level: process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error" ?? "info",
    logFile: join(LOGS_DIR, "maestro.jsonl"),
    console: mode === "cli" ? false : true, // Suppress console in CLI mode
  });

  // Load agent configs
  console.log("Loading agent configurations...");
  const agentConfigs = loadAllAgentConfigs(CONFIG_DIR);
  console.log(
    `Loaded ${agentConfigs.size} agent(s): ${[...agentConfigs.keys()].join(", ")}`
  );

  // Create LLM provider
  const provider = new AnthropicProvider();

  // Create tool registry and register built-in tools
  const tools = createToolRegistry();
  tools.registerAll(builtinTools);
  console.log(`Registered ${tools.list().length} tool(s): ${tools.list().join(", ")}`);
  const toolRegistry = tools.registry;

  // Create memory store
  const memoryStore = new MemoryStore({
    dbPath: join(DATA_DIR, "maestro.db"),
    maxMessages: 100,
  });

  // Get orchestrator config
  const orchestratorConfig = agentConfigs.get("orchestrator");
  if (!orchestratorConfig) {
    throw new Error("Orchestrator config not found");
  }

  // Factory function to create orchestrator
  const createOrchestrator = (context: AgentContext) => {
    return createOrchestratorAgent(
      orchestratorConfig,
      provider,
      agentConfigs as AgentRegistry,
      toolRegistry,
      context
    );
  };

  return {
    agentConfigs,
    provider,
    toolRegistry,
    memoryStore,
    createOrchestrator,
  };
}

async function runTelegram(app: AppContext): Promise<void> {
  const telegram = new TelegramAdapter({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    createOrchestrator: app.createOrchestrator,
    memoryStore: app.memoryStore,
  });

  // Handle shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    telegram.stop();
    app.memoryStore.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the bot
  console.log("Starting Maestro Telegram bot...");
  await telegram.start();
}

async function runCLI(app: AppContext): Promise<void> {
  const cli = new CLIAdapter({
    createOrchestrator: app.createOrchestrator,
    memoryStore: app.memoryStore,
  });

  // Check for pipe mode
  if (CLIAdapter.isPipeMode()) {
    await cli.runPipeMode();
  } else {
    await cli.startInteractive();
  }
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
  } else {
    await runTelegram(app);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
