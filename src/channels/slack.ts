import { App, LogLevel } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import { Agent } from "../core/agent.js";
import { AgentContext } from "../core/types.js";
import { MemoryStore } from "../memory/store.js";
import { getBudgetGuard } from "../observability/index.js";
import { DynamicAgentRegistry } from "../core/registry.js";
import { isAllowedSlackUser } from "./utils/allowlist.js";

export interface SlackAdapterOptions {
  botToken: string;
  appToken: string;
  signingSecret: string;
  createOrchestrator: (context: AgentContext) => Agent;
  memoryStore: MemoryStore;
  agentRegistry?: DynamicAgentRegistry;
}

export class SlackAdapter {
  private app: App;
  private createOrchestrator: (context: AgentContext) => Agent;
  private memoryStore: MemoryStore;
  private agentRegistry?: DynamicAgentRegistry;
  private sessions: Map<string, AgentContext> = new Map();

  constructor(options: SlackAdapterOptions) {
    this.app = new App({
      token: options.botToken,
      appToken: options.appToken,
      signingSecret: options.signingSecret,
      socketMode: true,
      logLevel: LogLevel.INFO,
    });

    this.createOrchestrator = options.createOrchestrator;
    this.memoryStore = options.memoryStore;
    this.agentRegistry = options.agentRegistry;

    this.setupCommands();
    this.setupEventHandlers();
    this.setupAppHome();
  }

  private getSessionKey(
    teamId: string,
    channelId: string,
    userId: string,
    threadTs?: string
  ): string {
    // Use thread timestamp to maintain separate sessions per thread
    if (threadTs) {
      return `${teamId}-${channelId}-${threadTs}`;
    }
    return `${teamId}-${channelId}-${userId}`;
  }

  private getOrCreateSession(
    teamId: string,
    channelId: string,
    userId: string,
    threadTs?: string
  ): AgentContext {
    const key = this.getSessionKey(teamId, channelId, userId, threadTs);

    // Check in-memory cache first
    let context = this.sessions.get(key);
    if (context) {
      return context;
    }

    // Load from persistent storage
    const session = this.memoryStore.getOrCreateSession("slack", key);
    context = this.memoryStore.createContext(session);
    context.metadata.slackTeamId = teamId;
    context.metadata.slackChannelId = channelId;
    context.metadata.slackUserId = userId;
    if (threadTs) {
      context.metadata.slackThreadTs = threadTs;
    }

    this.sessions.set(key, context);
    return context;
  }

  private setupCommands(): void {
    // Main command: /maestro <message>
    this.app.command("/maestro", async ({ command, ack, say, client }) => {
      await ack();

      const teamId = command.team_id;
      const channelId = command.channel_id;
      const userId = command.user_id;
      const text = command.text.trim();

      // Check allowlist
      if (!isAllowedSlackUser(userId)) {
        await say({
          text: ":x: Sorry, you are not authorized to use this bot.",
          channel: channelId,
        });
        return;
      }

      if (!text) {
        await say({
          text: "Usage: `/maestro <your message>` - Ask me anything!",
          channel: channelId,
        });
        return;
      }

      // Post initial "thinking" message
      const thinking = await client.chat.postMessage({
        channel: channelId,
        text: ":hourglass_flowing_sand: Thinking...",
      });

      try {
        const session = this.getOrCreateSession(teamId, channelId, userId);
        const orchestrator = this.createOrchestrator(session);

        let response = "";
        for await (const chunk of orchestrator.run(text)) {
          if (chunk.type === "text") {
            response += chunk.text;
          }
        }

        this.memoryStore.syncContext(session);
        if (session.metadata) {
          this.memoryStore.updateSessionMetadata(
            session.sessionId,
            session.metadata
          );
        }

        // Update the thinking message with the response
        await client.chat.update({
          channel: channelId,
          ts: thinking.ts!,
          text: response || "I processed your request but have no response.",
          blocks: this.formatResponseBlocks(response, userId),
        });
      } catch (error) {
        console.error("Error handling /maestro command:", error);
        await client.chat.update({
          channel: channelId,
          ts: thinking.ts!,
          text: ":x: Sorry, I encountered an error. Please try again.",
        });
      }
    });

    // Clear session command
    this.app.command("/maestro-clear", async ({ command, ack, say }) => {
      await ack();

      // Check allowlist
      if (!isAllowedSlackUser(command.user_id)) {
        await say({
          text: ":x: Sorry, you are not authorized to use this bot.",
          channel: command.channel_id,
        });
        return;
      }

      const key = this.getSessionKey(
        command.team_id,
        command.channel_id,
        command.user_id
      );
      const session = this.sessions.get(key);

      if (session) {
        this.memoryStore.clearSession(session.sessionId);
        session.history = [];
      }
      this.sessions.delete(key);

      await say({
        text: ":broom: Session cleared! Starting fresh.",
        channel: command.channel_id,
      });
    });

    // Budget status command
    this.app.command("/maestro-budget", async ({ command, ack, say }) => {
      await ack();

      // Check allowlist - critical for budget override
      if (!isAllowedSlackUser(command.user_id)) {
        await say({
          text: ":x: Sorry, you are not authorized to use this bot.",
          channel: command.channel_id,
        });
        return;
      }

      const budgetGuard = getBudgetGuard();
      if (!budgetGuard) {
        await say({
          text: "Budget tracking is not enabled.",
          channel: command.channel_id,
        });
        return;
      }

      const args = command.text.trim().split(/\s+/);
      if (args[0] === "override") {
        budgetGuard.override(60);
        await say({
          text: ":white_check_mark: Budget limit overridden for the next hour.",
          channel: command.channel_id,
        });
        return;
      }

      const status = budgetGuard.getStatus();
      const history = budgetGuard.getHistory(7);

      await say({
        channel: command.channel_id,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "Budget Status" },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Today's Spending:*\n$${status.dailySpent.toFixed(4)}`,
              },
              {
                type: "mrkdwn",
                text: `*Daily Limit:*\n$${status.dailyLimit.toFixed(2)}`,
              },
              {
                type: "mrkdwn",
                text: `*Remaining:*\n$${status.remaining.toFixed(4)}`,
              },
              {
                type: "mrkdwn",
                text: `*Usage:*\n${status.percentUsed.toFixed(1)}%`,
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: status.isExceeded
                  ? ":warning: *Limit exceeded!* Use `/maestro-budget override` to continue."
                  : status.percentUsed >= 80
                    ? ":warning: Approaching daily limit"
                    : ":white_check_mark: Budget OK",
              },
            ],
          },
          ...(history.length > 0
            ? [
                { type: "divider" as const },
                {
                  type: "section" as const,
                  text: {
                    type: "mrkdwn" as const,
                    text:
                      "*Recent History:*\n" +
                      history
                        .slice(0, 5)
                        .map(
                          (h) =>
                            `• ${h.date}: $${h.totalCost.toFixed(4)} (${h.requestCount} requests)`
                        )
                        .join("\n"),
                  },
                },
              ]
            : []),
        ],
      });
    });

    // List agents command
    this.app.command("/maestro-agents", async ({ command, ack, say }) => {
      await ack();

      // Check allowlist
      if (!isAllowedSlackUser(command.user_id)) {
        await say({
          text: ":x: Sorry, you are not authorized to use this bot.",
          channel: command.channel_id,
        });
        return;
      }

      if (!this.agentRegistry) {
        await say({
          text: "Agent registry not available.",
          channel: command.channel_id,
        });
        return;
      }

      const agents = this.agentRegistry.getAll();

      await say({
        channel: command.channel_id,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "Available Agents" },
          },
          ...agents.map((agent) => ({
            type: "section" as const,
            text: {
              type: "mrkdwn" as const,
              text: `*${agent.name}*\n${agent.description}\n_Tools:_ ${agent.tools.join(", ") || "None"}`,
            },
            accessory: {
              type: "button" as const,
              text: {
                type: "plain_text" as const,
                text: this.agentRegistry!.isDynamic(agent.name)
                  ? "Dynamic"
                  : "Static",
              },
              style: this.agentRegistry!.isDynamic(agent.name)
                ? ("primary" as const)
                : undefined,
            },
          })),
        ],
      });
    });
  }

  private setupEventHandlers(): void {
    // Handle @mentions in channels
    this.app.event("app_mention", async ({ event, say, client }) => {
      const teamId = (event as { team?: string }).team || "";
      const channelId = event.channel;
      const userId = event.user || "";
      // Use thread_ts if we're in a thread, otherwise use the message ts
      const threadTs = event.thread_ts || event.ts || "";
      const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

      // Check allowlist
      if (!isAllowedSlackUser(userId)) {
        await say({
          text: ":x: Sorry, you are not authorized to use this bot.",
          thread_ts: threadTs,
        });
        return;
      }

      if (!text) {
        await say({
          text: "Hi! How can I help you?",
          thread_ts: threadTs,
        });
        return;
      }

      // Add reaction to show we're processing
      try {
        await client.reactions.add({
          channel: channelId,
          timestamp: event.ts,
          name: "hourglass_flowing_sand",
        });
      } catch {
        // Ignore reaction errors
      }

      try {
        const session = this.getOrCreateSession(
          teamId,
          channelId,
          userId,
          threadTs
        );
        const orchestrator = this.createOrchestrator(session);

        let response = "";
        for await (const chunk of orchestrator.run(text)) {
          if (chunk.type === "text") {
            response += chunk.text;
          }
        }

        this.memoryStore.syncContext(session);
        if (session.metadata) {
          this.memoryStore.updateSessionMetadata(
            session.sessionId,
            session.metadata
          );
        }

        // Send response in thread
        await this.sendLongMessage(
          say,
          response || "I processed your request.",
          threadTs
        );

        // Update reaction to show completion
        try {
          await client.reactions.remove({
            channel: channelId,
            timestamp: event.ts,
            name: "hourglass_flowing_sand",
          });
          await client.reactions.add({
            channel: channelId,
            timestamp: event.ts,
            name: "white_check_mark",
          });
        } catch {
          // Ignore reaction errors
        }
      } catch (error) {
        console.error("Error handling app_mention:", error);
        await say({
          text: ":x: Sorry, I encountered an error. Please try again.",
          thread_ts: threadTs,
        });
      }
    });

    // Handle direct messages
    this.app.event("message", async ({ event, say, client }) => {
      // Only handle DMs (channel type "im")
      const msg = event as {
        channel_type?: string;
        user?: string;
        text?: string;
        bot_id?: string;
        team?: string;
        channel?: string;
        ts?: string;
      };
      if (msg.channel_type !== "im" || msg.bot_id || !msg.text) {
        return;
      }

      const teamId = msg.team || "";
      const channelId = msg.channel || "";
      const userId = msg.user || "";
      const text = msg.text;

      // Check allowlist
      if (!isAllowedSlackUser(userId)) {
        await say(":x: Sorry, you are not authorized to use this bot.");
        return;
      }

      // Add reaction to show we're processing
      try {
        await client.reactions.add({
          channel: channelId,
          timestamp: msg.ts!,
          name: "hourglass_flowing_sand",
        });
      } catch {
        // Ignore reaction errors
      }

      try {
        const session = this.getOrCreateSession(teamId, channelId, userId);
        const orchestrator = this.createOrchestrator(session);

        let response = "";
        for await (const chunk of orchestrator.run(text)) {
          if (chunk.type === "text") {
            response += chunk.text;
          }
        }

        this.memoryStore.syncContext(session);
        if (session.metadata) {
          this.memoryStore.updateSessionMetadata(
            session.sessionId,
            session.metadata
          );
        }

        await this.sendLongMessage(
          say,
          response || "I processed your request."
        );

        // Update reaction to show completion
        try {
          await client.reactions.remove({
            channel: channelId,
            timestamp: msg.ts!,
            name: "hourglass_flowing_sand",
          });
          await client.reactions.add({
            channel: channelId,
            timestamp: msg.ts!,
            name: "white_check_mark",
          });
        } catch {
          // Ignore reaction errors
        }
      } catch (error) {
        console.error("Error handling DM:", error);
        await say(":x: Sorry, I encountered an error. Please try again.");
      }
    });
  }

  private setupAppHome(): void {
    // App Home tab
    this.app.event("app_home_opened", async ({ event, client }) => {
      try {
        const budgetGuard = getBudgetGuard();
        const budgetStatus = budgetGuard?.getStatus();

        await client.views.publish({
          user_id: event.user,
          view: {
            type: "home",
            blocks: [
              {
                type: "header",
                text: { type: "plain_text", text: "Welcome to Maestro" },
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "I'm your AI assistant. Here's how to interact with me:",
                },
              },
              { type: "divider" },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text:
                    "*Commands:*\n" +
                    "• `/maestro <message>` - Ask me anything\n" +
                    "• `/maestro-clear` - Clear conversation history\n" +
                    "• `/maestro-budget` - Check budget status\n" +
                    "• `/maestro-agents` - List available agents\n\n" +
                    "*In Channels:*\n" +
                    "• @mention me to start a conversation\n" +
                    "• I'll reply in threads to keep things organized\n\n" +
                    "*Direct Messages:*\n" +
                    "• Message me directly for private conversations",
                },
              },
              ...(budgetStatus
                ? [
                    { type: "divider" as const },
                    {
                      type: "section" as const,
                      text: {
                        type: "mrkdwn" as const,
                        text: `*Today's Usage:* $${budgetStatus.dailySpent.toFixed(4)} / $${budgetStatus.dailyLimit.toFixed(2)} (${budgetStatus.percentUsed.toFixed(1)}%)`,
                      },
                    },
                  ]
                : []),
            ],
          },
        });
      } catch (error) {
        console.error("Error publishing App Home:", error);
      }
    });
  }

  private formatResponseBlocks(text: string, userId: string): KnownBlock[] {
    // Split long text into sections
    const maxBlockLength = 3000;
    const blocks: KnownBlock[] = [];

    if (text.length <= maxBlockLength) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text },
      });
    } else {
      // Split at paragraph boundaries
      let remaining = text;
      while (remaining.length > 0) {
        let chunk: string;
        if (remaining.length <= maxBlockLength) {
          chunk = remaining;
          remaining = "";
        } else {
          let breakPoint = remaining.lastIndexOf("\n\n", maxBlockLength);
          if (breakPoint === -1 || breakPoint < maxBlockLength / 2) {
            breakPoint = remaining.lastIndexOf("\n", maxBlockLength);
          }
          if (breakPoint === -1 || breakPoint < maxBlockLength / 2) {
            breakPoint = remaining.lastIndexOf(" ", maxBlockLength);
          }
          if (breakPoint === -1) {
            breakPoint = maxBlockLength;
          }
          chunk = remaining.slice(0, breakPoint);
          remaining = remaining.slice(breakPoint).trimStart();
        }
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: chunk },
        });
      }
    }

    // Add context with user mention
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Asked by <@${userId}>`,
        },
      ],
    });

    return blocks;
  }

  private async sendLongMessage(
    say: (
      msg: string | { text: string; thread_ts?: string; blocks?: object[] }
    ) => Promise<unknown>,
    text: string,
    threadTs?: string
  ): Promise<void> {
    const maxLength = 40000; // Slack's actual limit

    if (text.length <= maxLength) {
      await say(threadTs ? { text, thread_ts: threadTs } : text);
      return;
    }

    // Split into chunks
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

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
      await say(threadTs ? { text: chunk, thread_ts: threadTs } : chunk);
    }
  }

  async start(): Promise<void> {
    console.log("Starting Slack bot...");
    await this.app.start();
    console.log("Slack bot is running!");
  }

  async stop(): Promise<void> {
    await this.app.stop();
  }
}
