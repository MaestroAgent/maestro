import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "crypto";
import { Agent } from "../../core/agent.js";
import { AgentContext } from "../../core/types.js";
import { MemoryStore, ApiKeyRecord } from "../../memory/store.js";

// Type for context with API key
type Variables = {
  apiKey?: ApiKeyRecord;
};

export interface ChatRoutesOptions {
  createOrchestrator: (context: AgentContext) => Agent;
  memoryStore: MemoryStore;
}

export function createChatRoutes(options: ChatRoutesOptions): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  const { createOrchestrator, memoryStore } = options;

  /**
   * Check if user can access a session (owner or admin)
   */
  function canAccessSession(session: { apiKeyId?: string }, apiKey: ApiKeyRecord | undefined): boolean {
    if (!apiKey) {
      return true;
    }
    if (apiKey.isAdmin) {
      return true;
    }
    return session.apiKeyId === apiKey.id;
  }

  /**
   * POST /chat
   * Send a message and get a streaming response
   *
   * Body: { message: string, stream?: boolean }
   * Response: SSE stream or JSON
   *
   * Note: Session IDs are generated server-side to prevent session fixation attacks
   */
  app.post("/", async (c) => {
    const body = await c.req.json<{
      message: string;
      stream?: boolean;
    }>();

    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;

    // Generate session ID server-side (prevents session fixation)
    const userId = `api-${randomUUID()}`;
    const session = memoryStore.getOrCreateSession("api", userId, apiKey?.id);
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

      // Also sync metadata (for things like currentProject)
      if (context.metadata) {
        memoryStore.updateSessionMetadata(context.sessionId, context.metadata);
      }

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

        // Also sync metadata (for things like currentProject)
        if (context.metadata) {
          memoryStore.updateSessionMetadata(context.sessionId, context.metadata);
        }
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
    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;

    const session = memoryStore.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (!canAccessSession(session, apiKey)) {
      return c.json({ error: "Access denied" }, 403);
    }

    const history = memoryStore.loadHistory(sessionId);

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
    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;

    const session = memoryStore.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (!canAccessSession(session, apiKey)) {
      return c.json({ error: "Access denied" }, 403);
    }

    memoryStore.clearSession(sessionId);

    return c.json({ success: true, sessionId });
  });

  return app;
}
