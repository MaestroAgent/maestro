import * as readline from "readline";
import { Agent } from "../core/agent.js";
import { AgentContext } from "../core/types.js";
import { MemoryStore } from "../memory/store.js";
import { getCostTracker, clearCostTracker } from "../observability/index.js";

export interface CLIAdapterOptions {
  createOrchestrator: (context: AgentContext) => Agent;
  memoryStore: MemoryStore;
  userId?: string;
}

export class CLIAdapter {
  private createOrchestrator: (context: AgentContext) => Agent;
  private memoryStore: MemoryStore;
  private userId: string;
  private context: AgentContext | null = null;
  private rl: readline.Interface | null = null;

  constructor(options: CLIAdapterOptions) {
    this.createOrchestrator = options.createOrchestrator;
    this.memoryStore = options.memoryStore;
    this.userId = options.userId ?? "cli-user";
  }

  /**
   * Start interactive REPL mode
   */
  async startInteractive(): Promise<void> {
    this.initSession();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("Maestro CLI - Interactive Mode");
    console.log("Commands: /clear, /cost, /quit, /help");
    console.log("---");

    const prompt = () => {
      this.rl!.question("You: ", async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
          prompt();
          return;
        }

        // Handle commands
        if (trimmed.startsWith("/")) {
          await this.handleCommand(trimmed);
          prompt();
          return;
        }

        // Process message
        await this.processMessage(trimmed);
        prompt();
      });
    };

    prompt();

    // Handle Ctrl+C and close
    this.rl.on("close", () => {
      this.shutdown();
    });
  }

  /**
   * Process a single message (for pipe mode)
   */
  async processOnce(input: string): Promise<string> {
    this.initSession();
    return this.processMessageSilent(input);
  }

  /**
   * Check if running in pipe mode (stdin is not a TTY)
   */
  static isPipeMode(): boolean {
    return !process.stdin.isTTY;
  }

  /**
   * Run in pipe mode - read all stdin, process, output
   */
  async runPipeMode(): Promise<void> {
    const chunks: string[] = [];

    for await (const chunk of process.stdin) {
      chunks.push(chunk.toString());
    }

    const input = chunks.join("").trim();
    if (input) {
      const response = await this.processOnce(input);
      console.log(response);
    }

    this.shutdown();
  }

  private initSession(): void {
    if (!this.context) {
      const session = this.memoryStore.getOrCreateSession("cli", this.userId);
      this.context = this.memoryStore.createContext(session);
    }
  }

  private async handleCommand(command: string): Promise<void> {
    const cmd = command.toLowerCase();

    switch (cmd) {
      case "/clear":
        if (this.context) {
          this.memoryStore.clearSession(this.context.sessionId);
          clearCostTracker(this.context.sessionId);
          this.context.history = [];
        }
        console.log("Session cleared.\n");
        break;

      case "/cost":
        if (this.context) {
          const tracker = getCostTracker(this.context.sessionId);
          console.log(tracker.formatSummary());
        } else {
          console.log("No active session.\n");
        }
        break;

      case "/quit":
      case "/exit":
      case "/q":
        this.shutdown();
        process.exit(0);
        break;

      case "/help":
        console.log("\nCommands:");
        console.log("  /clear  - Clear conversation history");
        console.log("  /cost   - Show token usage and cost summary");
        console.log("  /quit   - Exit the CLI");
        console.log("  /help   - Show this help\n");
        break;

      default:
        console.log(`Unknown command: ${command}\n`);
        break;
    }
  }

  private async processMessage(input: string): Promise<void> {
    if (!this.context) return;

    process.stdout.write("\nMaestro: ");

    try {
      const orchestrator = this.createOrchestrator(this.context);

      for await (const chunk of orchestrator.run(input)) {
        if (chunk.type === "text") {
          process.stdout.write(chunk.text);
        }
      }

      // Sync context to storage
      this.memoryStore.syncContext(this.context);

      // Also sync metadata (for things like currentProject)
      if (this.context.metadata) {
        this.memoryStore.updateSessionMetadata(this.context.sessionId, this.context.metadata);
      }

      console.log("\n");
    } catch (error) {
      console.error(
        "\nError:",
        error instanceof Error ? error.message : String(error)
      );
      console.log();
    }
  }

  private async processMessageSilent(input: string): Promise<string> {
    if (!this.context) return "";

    let response = "";

    try {
      const orchestrator = this.createOrchestrator(this.context);

      for await (const chunk of orchestrator.run(input)) {
        if (chunk.type === "text") {
          response += chunk.text;
        }
      }

      // Sync context to storage
      this.memoryStore.syncContext(this.context);

      // Also sync metadata (for things like currentProject)
      if (this.context.metadata) {
        this.memoryStore.updateSessionMetadata(this.context.sessionId, this.context.metadata);
      }
    } catch (error) {
      response = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return response;
  }

  private shutdown(): void {
    if (this.rl) {
      this.rl.close();
    }
    this.memoryStore.close();
  }
}
