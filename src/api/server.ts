import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { Agent, AgentRegistry } from "../core/agent.js";
import { AgentContext } from "../core/types.js";
import { MemoryStore } from "../memory/store.js";
import { createChatRoutes } from "./routes/chat.js";
import { createAgentRoutes } from "./routes/agents.js";

export interface APIServerOptions {
  port?: number;
  createOrchestrator: (context: AgentContext) => Agent;
  memoryStore: MemoryStore;
  agentRegistry: AgentRegistry;
}

export class APIServer {
  private app: Hono;
  private options: APIServerOptions;
  private server: ReturnType<typeof serve> | null = null;

  constructor(options: APIServerOptions) {
    this.options = options;
    this.app = new Hono();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      })
    );

    // Request logging
    this.app.use("*", logger());
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (c) => {
      return c.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // API info
    this.app.get("/", (c) => {
      return c.json({
        name: "Maestro API",
        version: "0.1.0",
        endpoints: {
          health: "GET /health",
          chat: "POST /chat",
          chatHistory: "GET /chat/:sessionId",
          clearSession: "DELETE /chat/:sessionId",
          agents: "GET /agents",
          agentDetails: "GET /agents/:name",
        },
      });
    });

    // Mount routes
    const chatRoutes = createChatRoutes({
      createOrchestrator: this.options.createOrchestrator,
      memoryStore: this.options.memoryStore,
    });
    this.app.route("/chat", chatRoutes);

    const agentRoutes = createAgentRoutes({
      agentRegistry: this.options.agentRegistry,
    });
    this.app.route("/agents", agentRoutes);

    // 404 handler
    this.app.notFound((c) => {
      return c.json({ error: "Not found" }, 404);
    });

    // Error handler
    this.app.onError((err, c) => {
      console.error("API Error:", err);
      return c.json(
        { error: err.message || "Internal server error" },
        500
      );
    });
  }

  start(): void {
    const port = this.options.port ?? 3000;

    this.server = serve({
      fetch: this.app.fetch,
      port,
    });

    console.log(`Maestro API server running on http://localhost:${port}`);
  }

  stop(): void {
    if (this.server) {
      this.server.close();
    }
  }
}
