import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadAllAgentConfigs } from "./core/config.js";
import { AgentContext, ToolDefinition } from "./core/types.js";
import { AgentRegistry, ToolRegistry } from "./core/agent.js";
import { AnthropicProvider } from "./llm/anthropic.js";
import { createOrchestratorAgent } from "./agents/orchestrator.js";
import { TelegramAdapter } from "./channels/telegram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "config");

function validateEnv(): void {
  const required = ["ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("Please create a .env file based on .env.example");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // Validate environment
  validateEnv();

  // Load agent configs
  console.log("Loading agent configurations...");
  const agentConfigs = loadAllAgentConfigs(CONFIG_DIR);
  console.log(`Loaded ${agentConfigs.size} agent(s): ${[...agentConfigs.keys()].join(", ")}`);

  // Create LLM provider
  const provider = new AnthropicProvider();

  // Create tool registry (empty for now, tools added dynamically)
  const baseToolRegistry: ToolRegistry = new Map<string, ToolDefinition>();

  // Get orchestrator config
  const orchestratorConfig = agentConfigs.get("orchestrator");
  if (!orchestratorConfig) {
    throw new Error("Orchestrator config not found");
  }

  // Create Telegram adapter
  const telegram = new TelegramAdapter({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    createOrchestrator: (context: AgentContext) => {
      return createOrchestratorAgent(
        orchestratorConfig,
        provider,
        agentConfigs as AgentRegistry,
        baseToolRegistry,
        context
      );
    },
  });

  // Handle shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    telegram.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the bot
  console.log("Starting Maestro...");
  await telegram.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
