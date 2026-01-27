import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Agent } from "../core/agent.js";
import { DynamicAgentRegistry } from "../core/registry.js";
import { AgentContext } from "../core/types.js";
import { MemoryStore } from "../memory/store.js";
import { createChatRoutes } from "./routes/chat.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createSessionRoutes } from "./routes/sessions.js";
import { createObservabilityRoutes } from "./routes/observability.js";
import { initWebSocketManager, getWebSocketManager } from "./websocket.js";
import { createAuthMiddleware, validateWebSocketToken } from "./middleware/auth.js";
import { createRateLimitMiddleware, stopRateLimitStore } from "./middleware/rateLimit.js";

export interface APIServerOptions {
  port?: number;
  createOrchestrator: (context: AgentContext) => Agent;
  memoryStore: MemoryStore;
  agentRegistry: DynamicAgentRegistry;
  logFile?: string;
  dashboardPath?: string;
}

export class APIServer {
  private app: Hono;
  private options: APIServerOptions;
  private server: ReturnType<typeof serve> | null = null;
  private injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
  private upgradeWebSocket: ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];

  constructor(options: APIServerOptions) {
    this.options = options;
    this.app = new Hono();

    // Initialize WebSocket
    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: this.app });
    this.injectWebSocket = injectWebSocket;
    this.upgradeWebSocket = upgradeWebSocket;

    // Initialize WebSocket manager
    initWebSocketManager();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupDashboard();
  }

  private setupMiddleware(): void {
    // CORS - parse comma-separated origins from env var
    const corsOrigins = process.env.MAESTRO_CORS_ORIGINS;
    const origin = corsOrigins ? corsOrigins.split(",").map((o) => o.trim()) : "*";

    this.app.use(
      "*",
      cors({
        origin,
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      })
    );

    // Request logging
    this.app.use("*", logger());

    // Rate limiting (before auth to protect against brute force)
    this.app.use("*", createRateLimitMiddleware());

    // API key authentication
    this.app.use("*", createAuthMiddleware(this.options.memoryStore));
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
          sessions: "GET /sessions",
          sessionDetails: "GET /sessions/:id",
          sessionMessages: "GET /sessions/:id/messages",
          observabilityEvents: "GET /observability/events",
          observabilityCosts: "GET /observability/costs",
          observabilityBudget: "GET /observability/budget",
          websocket: "WS /ws",
          dashboard: "GET /dashboard",
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

    const sessionRoutes = createSessionRoutes({
      memoryStore: this.options.memoryStore,
    });
    this.app.route("/sessions", sessionRoutes);

    if (this.options.logFile) {
      const observabilityRoutes = createObservabilityRoutes({
        logFile: this.options.logFile,
      });
      this.app.route("/observability", observabilityRoutes);
    }

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

  private setupWebSocket(): void {
    const memoryStore = this.options.memoryStore;

    this.app.get(
      "/ws",
      this.upgradeWebSocket((c) => {
        // Get token from query parameter
        const token = c.req.query("token");
        let authenticated = validateWebSocketToken(memoryStore, token);

        return {
          onOpen: (_event, ws) => {
            if (authenticated) {
              const manager = getWebSocketManager();
              if (manager) {
                manager.addClient(ws);
              }
            }
          },
          onMessage: (event, ws) => {
            try {
              const data = JSON.parse(event.data.toString());

              // Handle auth message if not yet authenticated
              if (!authenticated && data.type === "auth" && data.token) {
                if (validateWebSocketToken(memoryStore, data.token)) {
                  authenticated = true;
                  const manager = getWebSocketManager();
                  if (manager) {
                    manager.addClient(ws);
                  }
                  ws.send(JSON.stringify({ type: "auth", success: true }));
                } else {
                  ws.send(JSON.stringify({ type: "auth", success: false, error: "Invalid token" }));
                  ws.close(4001, "Unauthorized");
                }
                return;
              }

              // Reject messages from unauthenticated clients
              if (!authenticated) {
                ws.send(JSON.stringify({ type: "error", error: "Not authenticated" }));
                return;
              }

              if (data.type === "ping") {
                ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
              }
            } catch {
              // Ignore malformed messages
            }
          },
          onClose: (_event, ws) => {
            const manager = getWebSocketManager();
            if (manager) {
              manager.removeClient(ws);
            }
          },
          onError: (_event, ws) => {
            const manager = getWebSocketManager();
            if (manager) {
              manager.removeClient(ws);
            }
          },
        };
      })
    );
  }

  private setupDashboard(): void {
    if (!this.options.dashboardPath) {
      return;
    }

    // Serve static assets from dashboard dist
    this.app.use(
      "/dashboard/*",
      serveStatic({
        root: this.options.dashboardPath,
        rewriteRequestPath: (path) => path.replace(/^\/dashboard/, ""),
      })
    );

    // Serve index.html for SPA routing
    this.app.get("/dashboard", (c) => {
      return c.redirect("/dashboard/");
    });

    // Fallback to index.html for client-side routing
    this.app.get("/dashboard/*", async (c) => {
      const response = await serveStatic({
        root: this.options.dashboardPath!,
        path: "index.html",
      })(c, async () => {});
      return response || c.notFound();
    });
  }

  start(): void {
    const port = this.options.port ?? 3000;

    this.server = serve({
      fetch: this.app.fetch,
      port,
    });

    // Inject WebSocket support
    this.injectWebSocket(this.server);

    console.log(`Maestro API server running on http://localhost:${port}`);
    console.log(`WebSocket available at ws://localhost:${port}/ws`);
    if (this.options.dashboardPath) {
      console.log(`Dashboard available at http://localhost:${port}/dashboard`);
    }
  }

  stop(): void {
    const manager = getWebSocketManager();
    if (manager) {
      manager.close();
    }
    stopRateLimitStore();
    if (this.server) {
      this.server.close();
    }
  }

  getWebSocketManager() {
    return getWebSocketManager();
  }
}
