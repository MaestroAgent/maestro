import * as readline from "readline";
import { ChannelEngine } from "./engine.js";
import { MemoryStore } from "../memory/store.js";
import {
  getCostTracker,
  clearCostTracker,
  getBudgetGuard,
} from "../observability/index.js";

export interface CLIAdapterOptions {
  engine: ChannelEngine;
  memoryStore: MemoryStore;
  userId?: string;
}

export class CLIAdapter {
  private engine: ChannelEngine;
  private memoryStore: MemoryStore;
  private userId: string;
  private rl: readline.Interface | null = null;

  constructor(options: CLIAdapterOptions) {
    this.engine = options.engine;
    this.memoryStore = options.memoryStore;
    this.userId = options.userId ?? "cli-user";
  }

  /**
   * Start interactive REPL mode
   */
  async startInteractive(): Promise<void> {
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

  private getSessionId(): string {
    return this.memoryStore.getOrCreateSession("cli", this.userId).id;
  }

  private async handleCommand(command: string): Promise<void> {
    const parts = command.toLowerCase().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case "/clear": {
        const sessionId = this.getSessionId();
        this.memoryStore.clearSession(sessionId);
        clearCostTracker(sessionId);
        this.engine.clearSession("cli", this.userId);
        console.log("Session cleared.\n");
        break;
      }

      case "/cost": {
        const sessionId = this.getSessionId();
        const tracker = getCostTracker(sessionId);
        console.log(tracker.formatSummary());
        break;
      }

      case "/budget": {
        const budgetGuard = getBudgetGuard();
        if (!budgetGuard) {
          console.log("Budget tracking is not enabled.\n");
          break;
        }
        if (args[0] === "override") {
          budgetGuard.override(60);
          console.log("Budget limit overridden for the next hour.\n");
        } else {
          console.log(budgetGuard.formatStatus());
        }
        break;
      }

      case "/quit":
      case "/exit":
      case "/q":
        this.shutdown();
        process.exit(0);
        break;

      case "/help":
        console.log("\nCommands:");
        console.log("  /clear           - Clear conversation history");
        console.log("  /cost            - Show token usage and cost summary");
        console.log("  /budget          - Show daily budget status");
        console.log("  /budget override - Override budget limit for 1 hour");
        console.log("  /quit            - Exit the CLI");
        console.log("  /help            - Show this help\n");
        break;

      default:
        console.log(`Unknown command: ${command}\n`);
        break;
    }
  }

  private async processMessage(input: string): Promise<void> {
    process.stdout.write("\nMaestro: ");

    try {
      for await (const chunk of this.engine.run("cli", this.userId, input)) {
        if (chunk.type === "text") {
          process.stdout.write(chunk.text);
        }
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
    let response = "";

    try {
      for await (const chunk of this.engine.run("cli", this.userId, input)) {
        if (chunk.type === "text") {
          response += chunk.text;
        }
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
  }
}
