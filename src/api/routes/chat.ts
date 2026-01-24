import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Agent } from "../../core/agent.js";
import { AgentContext } from "../../core/types.js";
import { MemoryStore } from "../../memory/store.js";

export interface ChatRoutesOptions {
  createOrchestrator: (context: AgentContext) => Agent;
  memoryStore: MemoryStore;
}

export function createChatRoutes(options: ChatRoutesOptions): Hono {
  const app = new Hono();
  const { createOrchestrator, memoryStore } = options;

  /**
   * POST /chat
   * Send a message and get a streaming response
   *
   * Body: { message: string, sessionId?: string, stream?: boolean }
   * Response: SSE stream or JSON
   */
  app.post("/", async (c) => {
    const body = await c.req.json<{
      message: string;
      sessionId?: string;
      stream?: boolean;
    }>();

    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    // Get or create session
    const sessionId = body.sessionId ?? `api-${Date.now()}`;
    const session = memoryStore.getOrCreateSession("api", sessionId);
    const context = memoryStore.createContext(session);

    const orchestrator = createOrchestrator(context);

    // Non-streaming mode
    if (body.stream === false) {
      let response = "";
      for await (const chunk of orchestrator.run(body.message)) {
        if (chunk.type === "text") {
          response += chunk.text;
        }
      }

      // Sync context to storage
      memoryStore.syncContext(context);

      return c.json({
        sessionId: context.sessionId,
        response,
      });
    }

    // Streaming mode (default)
    return streamSSE(c, async (stream) => {
      try {
        for await (const chunk of orchestrator.run(body.message)) {
          if (chunk.type === "text") {
            await stream.writeSSE({
              event: "text",
              data: JSON.stringify({ text: chunk.text }),
            });
          } else if (chunk.type === "tool_call") {
            await stream.writeSSE({
              event: "tool_call",
              data: JSON.stringify({
                name: chunk.toolCall.name,
                arguments: chunk.toolCall.arguments,
              }),
            });
          } else if (chunk.type === "done") {
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({
                sessionId: context.sessionId,
                usage: chunk.usage,
              }),
            });
          }
        }

        // Sync context to storage
        memoryStore.syncContext(context);
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    });
  });

  /**
   * GET /chat/:sessionId
   * Get session history
   */
  app.get("/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");

    const history = memoryStore.loadHistory(sessionId);
    if (history.length === 0) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({
      sessionId,
      messages: history,
    });
  });

  /**
   * DELETE /chat/:sessionId
   * Clear session history
   */
  app.delete("/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");

    memoryStore.clearSession(sessionId);

    return c.json({ success: true, sessionId });
  });

  return app;
}
