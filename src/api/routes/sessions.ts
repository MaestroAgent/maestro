import { Hono } from "hono";
import { MemoryStore, ApiKeyRecord } from "../../memory/store.js";

// Type for context with API key
type Variables = {
  apiKey?: ApiKeyRecord;
};

// Pagination bounds
const MIN_LIMIT = 1;
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 50;

/**
 * Validate and bound pagination parameters
 */
function boundPagination(limitStr: string | undefined, offsetStr: string | undefined): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(limitStr ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MIN_LIMIT), MAX_LIMIT);
  const offset = Math.max(parseInt(offsetStr ?? "0", 10) || 0, 0);
  return { limit, offset };
}

export interface SessionRoutesOptions {
  memoryStore: MemoryStore;
}

export function createSessionRoutes(options: SessionRoutesOptions): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  const { memoryStore } = options;

  /**
   * Check if user can access a session (owner or admin)
   */
  function canAccessSession(session: { apiKeyId?: string }, apiKey: ApiKeyRecord | undefined): boolean {
    if (!apiKey) {
      // Auth disabled, allow access
      return true;
    }
    if (apiKey.isAdmin) {
      return true;
    }
    // Owner check: session must belong to this API key
    return session.apiKeyId === apiKey.id;
  }

  /**
   * GET /sessions
   * List all sessions, optionally filtered by channel
   * Non-admin users only see their own sessions
   */
  app.get("/", async (c) => {
    const channel = c.req.query("channel");
    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;

    // Non-admin users only see their own sessions
    const apiKeyId = apiKey?.isAdmin ? undefined : apiKey?.id;
    const sessions = memoryStore.getAllSessions(channel, apiKeyId);

    return c.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        channel: s.channel,
        userId: s.userId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: memoryStore.getMessageCount(s.id),
        // Don't expose full metadata to prevent data leakage
      })),
    });
  });

  /**
   * GET /sessions/:id
   * Get session details
   */
  app.get("/:id", async (c) => {
    const sessionId = c.req.param("id");
    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;
    const session = memoryStore.getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (!canAccessSession(session, apiKey)) {
      return c.json({ error: "Access denied" }, 403);
    }

    return c.json({
      id: session.id,
      channel: session.channel,
      userId: session.userId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: memoryStore.getMessageCount(session.id),
    });
  });

  /**
   * GET /sessions/:id/messages
   * Get paginated message history for a session
   */
  app.get("/:id/messages", async (c) => {
    const sessionId = c.req.param("id");
    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;
    const { limit, offset } = boundPagination(c.req.query("limit"), c.req.query("offset"));

    const session = memoryStore.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (!canAccessSession(session, apiKey)) {
      return c.json({ error: "Access denied" }, 403);
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
    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;
    const session = memoryStore.getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (!canAccessSession(session, apiKey)) {
      return c.json({ error: "Access denied" }, 403);
    }

    memoryStore.deleteSession(sessionId);
    return c.json({ success: true, sessionId });
  });

  return app;
}
