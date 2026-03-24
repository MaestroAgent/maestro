import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "crypto";
import { MemoryStore, ApiKeyRecord } from "../../memory/store.js";
import { ChannelEngine } from "../../channels/engine.js";

// Type for context with API key
type Variables = {
  apiKey?: ApiKeyRecord;
};

export interface ChatRoutesOptions {
  engine: ChannelEngine;
  memoryStore: MemoryStore;
}

export function createChatRoutes(
  options: ChatRoutesOptions
): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  const { engine, memoryStore } = options;

  /**
   * Check if user can access a session (owner or admin)
   */
  function canAccessSession(
    session: { apiKeyId?: string },
    apiKey: ApiKeyRecord | undefined
  ): boolean {
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
    // Maximum message size (50KB should handle most legitimate requests)
    const MAX_MESSAGE_LENGTH = 50000;

    const body = await c.req.json<Record<string, unknown>>();

    // Validate message exists and is a string
    if (body.message === undefined || body.message === null) {
      return c.json({ error: "message is required" }, 400);
    }

    if (typeof body.message !== "string") {
      return c.json({ error: "message must be a string" }, 400);
    }

    if (body.message.length === 0) {
      return c.json({ error: "message cannot be empty" }, 400);
    }

    if (body.message.length > MAX_MESSAGE_LENGTH) {
      return c.json(
        {
          error: `message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
          maxLength: MAX_MESSAGE_LENGTH,
          actualLength: body.message.length,
        },
        413
      );
    }

    // Now safe to use
    const message = body.message;
    const stream = body.stream !== false; // default to streaming

    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;

    // Generate session ID server-side (prevents session fixation)
    const userId = `api-${randomUUID()}`;
    // Pre-create session so we have the sessionId for SSE events
    const session = memoryStore.getOrCreateSession("api", userId, apiKey?.id);
    const chunks = engine.run("api", userId, message, apiKey?.id);

    // Non-streaming mode
    if (!stream) {
      let response = "";
      for await (const chunk of chunks) {
        if (chunk.type === "text") {
          response += chunk.text;
        }
      }

      return c.json({
        sessionId: session.id,
        response,
      });
    }

    // Streaming mode (default)
    return streamSSE(c, async (sseStream) => {
      try {

        for await (const chunk of chunks) {
          if (chunk.type === "text") {
            await sseStream.writeSSE({
              event: "text",
              data: JSON.stringify({ text: chunk.text }),
            });
          } else if (chunk.type === "tool_call") {
            await sseStream.writeSSE({
              event: "tool_call",
              data: JSON.stringify({
                name: chunk.toolCall.name,
                arguments: chunk.toolCall.arguments,
              }),
            });
          } else if (chunk.type === "done") {
            await sseStream.writeSSE({
              event: "done",
              data: JSON.stringify({
                sessionId: session.id,
                usage: chunk.usage,
              }),
            });
          }
        }
      } catch (error) {
        await sseStream.writeSSE({
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
