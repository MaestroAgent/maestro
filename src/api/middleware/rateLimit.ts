import { MiddlewareHandler } from "hono";

/**
 * Rate limit configuration per route pattern
 */
interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

/**
 * Sliding window entry for rate tracking
 */
interface RateLimitEntry {
  timestamps: number[];
}

/**
 * Rate limit store using sliding window algorithm
 */
class RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request is allowed and record it
   */
  check(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    // Check if under limit
    if (entry.timestamps.length >= limit) {
      const oldestInWindow = entry.timestamps[0];
      const resetMs = oldestInWindow + windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        resetMs,
      };
    }

    // Record this request
    entry.timestamps.push(now);

    return {
      allowed: true,
      remaining: limit - entry.timestamps.length,
      resetMs: windowMs,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    // Use 5 minute window for cleanup to cover all rate limit windows
    const maxWindow = 5 * 60 * 1000;

    for (const [key, entry] of this.store.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => ts > now - maxWindow);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Default rate limits per route pattern
const defaultRateLimits: Record<string, RateLimitConfig> = {
  "POST:/chat": { limit: 20, windowMs: 60000 },
  "GET:/agents": { limit: 60, windowMs: 60000 },
  "GET:/sessions": { limit: 60, windowMs: 60000 },
  "GET:/observability": { limit: 30, windowMs: 60000 },
  "POST:/observability/budget/override": { limit: 5, windowMs: 60000 },
  default: { limit: 60, windowMs: 60000 },
};

// Paths exempt from rate limiting
const exemptPaths = ["/health", "/dashboard", "/ws"];

// Global store instance
let rateLimitStore: RateLimitStore | null = null;

/**
 * Get rate limit store (create if needed)
 */
function getStore(): RateLimitStore {
  if (!rateLimitStore) {
    rateLimitStore = new RateLimitStore();
  }
  return rateLimitStore;
}

/**
 * Get rate limit config for a route
 */
function getRateLimitConfig(method: string, path: string): RateLimitConfig | null {
  // Check for exempt paths
  for (const exempt of exemptPaths) {
    if (path === exempt || path.startsWith(exempt + "/")) {
      return null;
    }
  }

  // Get custom limit from env for chat endpoint
  const chatLimit = parseInt(process.env.MAESTRO_RATE_LIMIT_CHAT || "20", 10);

  // Check for specific route matches
  const routeKey = `${method}:${path}`;

  // Exact match
  if (defaultRateLimits[routeKey]) {
    const config = defaultRateLimits[routeKey];
    // Apply env override for chat endpoint
    if (routeKey === "POST:/chat") {
      return { ...config, limit: chatLimit };
    }
    return config;
  }

  // Prefix match for route patterns
  for (const [pattern, config] of Object.entries(defaultRateLimits)) {
    if (pattern === "default") continue;
    const [patternMethod, patternPath] = pattern.split(":");
    if (method === patternMethod && path.startsWith(patternPath)) {
      return config;
    }
  }

  return defaultRateLimits.default;
}

/**
 * Extract client identifier for rate limiting
 * Uses API key if authenticated, IP address otherwise
 */
function getClientId(c: { req: { header: (name: string) => string | undefined }; env?: { incoming?: { socket?: { remoteAddress?: string } } } }): string {
  // Try API key first
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    if (apiKey.startsWith("msk_")) {
      return `key:${apiKey.slice(0, 16)}`; // Use prefix of key for privacy
    }
  }

  // Fall back to IP address
  const forwardedFor = c.req.header("X-Forwarded-For");
  if (forwardedFor) {
    return `ip:${forwardedFor.split(",")[0].trim()}`;
  }

  const realIp = c.req.header("X-Real-IP");
  if (realIp) {
    return `ip:${realIp}`;
  }

  // Try to get from socket (may not be available in all environments)
  const remoteAddress = c.env?.incoming?.socket?.remoteAddress;
  if (remoteAddress) {
    return `ip:${remoteAddress}`;
  }

  return "ip:unknown";
}

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Check if rate limiting is disabled
    if (process.env.MAESTRO_RATE_LIMIT_ENABLED === "false") {
      return next();
    }

    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    // Get rate limit config for this route
    const config = getRateLimitConfig(method, path);
    if (!config) {
      return next();
    }

    const clientId = getClientId(c);
    const store = getStore();
    const routeKey = `${method}:${path}`;
    const storeKey = `${clientId}:${routeKey}`;

    const result = store.check(storeKey, config.limit, config.windowMs);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(config.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil((Date.now() + result.resetMs) / 1000)));

    if (!result.allowed) {
      c.header("Retry-After", String(Math.ceil(result.resetMs / 1000)));
      return c.json(
        {
          error: "Too many requests",
          message: `Rate limit exceeded. Try again in ${Math.ceil(result.resetMs / 1000)} seconds.`,
          retryAfter: Math.ceil(result.resetMs / 1000),
        },
        429
      );
    }

    return next();
  };
}

/**
 * Stop and cleanup rate limit store (for graceful shutdown)
 */
export function stopRateLimitStore(): void {
  if (rateLimitStore) {
    rateLimitStore.stop();
    rateLimitStore = null;
  }
}
