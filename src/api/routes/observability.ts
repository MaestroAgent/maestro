import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { readFileSync, existsSync, statSync, watchFile, unwatchFile } from "fs";
import { getBudgetGuard } from "../../observability/budget.js";
import { LogEvent } from "../../observability/types.js";
import { ApiKeyRecord } from "../../memory/store.js";

// Type for context with API key
type Variables = {
  apiKey?: ApiKeyRecord;
};

// Pagination bounds
const MIN_TAIL = 1;
const MAX_TAIL = 1000;
const DEFAULT_TAIL = 50;

// Budget override limits
const MAX_OVERRIDE_MINUTES = 480; // 8 hours maximum

export interface ObservabilityRoutesOptions {
  logFile: string;
}

export function createObservabilityRoutes(
  options: ObservabilityRoutesOptions
): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  const { logFile } = options;

  /**
   * GET /observability/events
   * Stream log events via SSE
   * Query params:
   *   - tail: number of recent events to return (default 50, max 1000)
   *   - follow: if "true", stream new events as they arrive
   */
  app.get("/events", async (c) => {
    const tailParam = parseInt(c.req.query("tail") ?? String(DEFAULT_TAIL), 10);
    const tail = Math.min(Math.max(tailParam || DEFAULT_TAIL, MIN_TAIL), MAX_TAIL);
    const follow = c.req.query("follow") === "true";

    if (!existsSync(logFile)) {
      return c.json({ error: "Log file not found" }, 404);
    }

    // Read recent events
    const content = readFileSync(logFile, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const recentLines = lines.slice(-tail);
    const events: LogEvent[] = recentLines
      .map((line) => {
        try {
          return JSON.parse(line) as LogEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is LogEvent => e !== null);

    // If not following, return as JSON array
    if (!follow) {
      return c.json({ events });
    }

    // Stream mode - send recent events then watch for new ones
    return streamSSE(c, async (stream) => {
      // Send recent events
      for (const event of events) {
        await stream.writeSSE({
          event: "log",
          data: JSON.stringify(event),
        });
      }

      // Track file position for new events
      let lastSize = statSync(logFile).size;

      // Set up file watcher
      const onFileChange = async () => {
        try {
          const currentSize = statSync(logFile).size;
          if (currentSize > lastSize) {
            // Read new content
            const fd = readFileSync(logFile, "utf-8");
            const allContent = fd.substring(lastSize);
            const newLines = allContent.trim().split("\n").filter(Boolean);

            for (const line of newLines) {
              try {
                const event = JSON.parse(line) as LogEvent;
                await stream.writeSSE({
                  event: "log",
                  data: JSON.stringify(event),
                });
              } catch {
                // Skip malformed lines
              }
            }
            lastSize = currentSize;
          }
        } catch {
          // File may be temporarily unavailable
        }
      };

      watchFile(logFile, { interval: 500 }, onFileChange);

      // Send heartbeat to keep connection alive
      const heartbeat = setInterval(async () => {
        try {
          await stream.writeSSE({
            event: "heartbeat",
            data: JSON.stringify({ timestamp: new Date().toISOString() }),
          });
        } catch {
          clearInterval(heartbeat);
          unwatchFile(logFile, onFileChange);
        }
      }, 30000);

      // Clean up on close
      stream.onAbort(() => {
        clearInterval(heartbeat);
        unwatchFile(logFile, onFileChange);
      });

      // Keep stream open until client disconnects
      await new Promise(() => {});
    });
  });

  /**
   * GET /observability/costs
   * Get cost summary from budget guard
   */
  app.get("/costs", async (c) => {
    const budgetGuard = getBudgetGuard();

    if (!budgetGuard) {
      return c.json({ error: "Budget guard not initialized" }, 500);
    }

    const status = budgetGuard.getStatus();
    const history = budgetGuard.getHistory(30);

    // Parse log file for per-session costs if available
    const sessionCosts: Record<
      string,
      { inputTokens: number; outputTokens: number; requests: number }
    > = {};

    if (existsSync(logFile)) {
      const content = readFileSync(logFile, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (
            event.event === "agent.response" &&
            event.sessionId &&
            event.inputTokens !== undefined
          ) {
            if (!sessionCosts[event.sessionId]) {
              sessionCosts[event.sessionId] = {
                inputTokens: 0,
                outputTokens: 0,
                requests: 0,
              };
            }
            sessionCosts[event.sessionId].inputTokens += event.inputTokens;
            sessionCosts[event.sessionId].outputTokens += event.outputTokens;
            sessionCosts[event.sessionId].requests += 1;
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    return c.json({
      today: {
        spent: status.dailySpent,
        limit: status.dailyLimit,
        remaining: status.remaining,
        percentUsed: status.percentUsed,
      },
      history: history.map((h) => ({
        date: h.date,
        cost: h.totalCost,
        requests: h.requestCount,
      })),
      bySessions: Object.entries(sessionCosts).map(([id, data]) => ({
        sessionId: id,
        ...data,
      })),
    });
  });

  /**
   * GET /observability/budget
   * Get current budget status
   */
  app.get("/budget", async (c) => {
    const budgetGuard = getBudgetGuard();

    if (!budgetGuard) {
      return c.json({ error: "Budget guard not initialized" }, 500);
    }

    const status = budgetGuard.getStatus();

    return c.json({
      dailySpent: status.dailySpent,
      dailyLimit: status.dailyLimit,
      remaining: status.remaining,
      percentUsed: status.percentUsed,
      isExceeded: status.isExceeded,
      date: status.date,
    });
  });

  /**
   * POST /observability/budget/override
   * Override budget limit temporarily
   * Requires admin API key
   */
  app.post("/budget/override", async (c) => {
    const apiKey = c.get("apiKey") as ApiKeyRecord | undefined;

    // Require admin privileges for budget override
    if (apiKey && !apiKey.isAdmin) {
      return c.json({ error: "Admin privileges required for budget override" }, 403);
    }

    const budgetGuard = getBudgetGuard();

    if (!budgetGuard) {
      return c.json({ error: "Budget guard not initialized" }, 500);
    }

    const body = await c.req.json<{ durationMinutes?: number }>().catch(() => ({ durationMinutes: undefined }));
    // Cap duration at MAX_OVERRIDE_MINUTES to prevent abuse
    const requestedDuration = body.durationMinutes ?? 60;
    const duration = Math.min(Math.max(requestedDuration, 1), MAX_OVERRIDE_MINUTES);

    budgetGuard.override(duration);

    return c.json({
      success: true,
      message: `Budget override active for ${duration} minutes`,
      requestedDuration,
      actualDuration: duration,
      maxAllowed: MAX_OVERRIDE_MINUTES,
    });
  });

  return app;
}
