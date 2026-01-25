import { Bot, Context } from "grammy";
import { Agent } from "../core/agent.js";
import { AgentContext } from "../core/types.js";
import { MemoryStore } from "../memory/store.js";
import { getBudgetGuard } from "../observability/index.js";

export interface TelegramAdapterOptions {
  token: string;
  createOrchestrator: (context: AgentContext) => Agent;
  memoryStore: MemoryStore;
}

export class TelegramAdapter {
  private bot: Bot;
  private createOrchestrator: (context: AgentContext) => Agent;
  private memoryStore: MemoryStore;
  private sessions: Map<number, AgentContext> = new Map();

  constructor(options: TelegramAdapterOptions) {
    this.bot = new Bot(options.token);
    this.createOrchestrator = options.createOrchestrator;
    this.memoryStore = options.memoryStore;

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle /start command
    this.bot.command("start", async (ctx) => {
      await ctx.reply(
        "Hello! I'm Maestro, your AI assistant. How can I help you today?"
      );
    });

    // Handle /clear command to reset session
    this.bot.command("clear", async (ctx) => {
      const chatId = ctx.chat?.id;
      if (chatId) {
        const session = this.sessions.get(chatId);
        if (session) {
          this.memoryStore.clearSession(session.sessionId);
          session.history = [];
        }
        this.sessions.delete(chatId);
        await ctx.reply("Session cleared. Starting fresh!");
      }
    });

    // Handle /budget command to check budget status
    this.bot.command("budget", async (ctx) => {
      const budgetGuard = getBudgetGuard();
      if (!budgetGuard) {
        await ctx.reply("Budget tracking is not enabled.");
        return;
      }

      const messageText = ctx.message?.text || "";
      const args = messageText.split(/\s+/).slice(1);

      if (args[0] === "override") {
        budgetGuard.override(60); // 1 hour override
        await ctx.reply("Budget limit overridden for the next hour. Use responsibly!");
        return;
      }

      await ctx.reply(budgetGuard.formatStatus());
    });

    // Handle all text messages
    this.bot.on("message:text", async (ctx) => {
      await this.handleMessage(ctx);
    });

    // Error handler
    this.bot.catch((err) => {
      console.error("Telegram bot error:", err);
    });
  }

  private getOrCreateSession(chatId: number): AgentContext {
    // Check in-memory cache first
    let context = this.sessions.get(chatId);
    if (context) {
      return context;
    }

    // Load from persistent storage
    const session = this.memoryStore.getOrCreateSession(
      "telegram",
      String(chatId)
    );
    context = this.memoryStore.createContext(session);
    context.metadata.telegramChatId = chatId;

    this.sessions.set(chatId, context);
    return context;
  }

  private async handleMessage(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const messageText = ctx.message?.text;

    if (!chatId || !messageText) {
      return;
    }

    // Send typing indicator
    await ctx.replyWithChatAction("typing");

    try {
      // Get or create session context
      const session = this.getOrCreateSession(chatId);

      // Create orchestrator with session context
      const orchestrator = this.createOrchestrator(session);

      // Run the orchestrator and collect response
      let response = "";
      for await (const chunk of orchestrator.run(messageText)) {
        if (chunk.type === "text") {
          response += chunk.text;
        }
      }

      // Sync context to persistent storage
      this.memoryStore.syncContext(session);

      // Also sync metadata (for things like currentProject)
      if (session.metadata) {
        this.memoryStore.updateSessionMetadata(session.sessionId, session.metadata);
      }

      // Send response (Telegram has 4096 char limit)
      if (response) {
        await this.sendLongMessage(ctx, response);
      } else {
        await ctx.reply("I processed your request but have no response.");
      }
    } catch (error) {
      console.error("Error handling message:", error);
      await ctx.reply(
        "Sorry, I encountered an error processing your request. Please try again."
      );
    }
  }

  private async sendLongMessage(ctx: Context, text: string): Promise<void> {
    const maxLength = 4096;

    if (text.length <= maxLength) {
      await ctx.reply(text);
      return;
    }

    // Split into chunks at natural boundaries
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point
      let breakPoint = remaining.lastIndexOf("\n\n", maxLength);
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf("\n", maxLength);
      }
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf(" ", maxLength);
      }
      if (breakPoint === -1) {
        breakPoint = maxLength;
      }

      chunks.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint).trimStart();
    }

    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  }

  async start(): Promise<void> {
    console.log("Starting Telegram bot...");
    await this.bot.start();
  }

  stop(): void {
    this.bot.stop();
  }
}
