import { Hono } from "hono";
import { MemoryStore } from "../../memory/store.js";

export interface SessionRoutesOptions {
  memoryStore: MemoryStore;
}

export function createSessionRoutes(options: SessionRoutesOptions): Hono {
  const app = new Hono();
  const { memoryStore } = options;

  /**
   * GET /sessions
   * List all sessions, optionally filtered by channel
   */
  app.get("/", async (c) => {
    const channel = c.req.query("channel");
    const sessions = memoryStore.getAllSessions(channel);

    return c.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        channel: s.channel,
        userId: s.userId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: memoryStore.getMessageCount(s.id),
        metadata: s.metadata,
      })),
    });
  });

  /**
   * GET /sessions/:id
   * Get session details
   */
  app.get("/:id", async (c) => {
    const sessionId = c.req.param("id");
    const session = memoryStore.getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({
      id: session.id,
      channel: session.channel,
      userId: session.userId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: memoryStore.getMessageCount(session.id),
      metadata: session.metadata,
    });
  });

  /**
   * GET /sessions/:id/messages
   * Get paginated message history for a session
   */
  app.get("/:id/messages", async (c) => {
    const sessionId = c.req.param("id");
    const limit = parseInt(c.req.query("limit") ?? "50", 10);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const session = memoryStore.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const { messages, total } = memoryStore.loadHistoryPaginated(
      sessionId,
      limit,
      offset
    );

    return c.json({
      sessionId,
      messages,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + messages.length < total,
      },
    });
  });

  /**
   * DELETE /sessions/:id
   * Delete a session and all its messages
   */
  app.delete("/:id", async (c) => {
    const sessionId = c.req.param("id");
    const session = memoryStore.getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    memoryStore.deleteSession(sessionId);
    return c.json({ success: true, sessionId });
  });

  return app;
}
