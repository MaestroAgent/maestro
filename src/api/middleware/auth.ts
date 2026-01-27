import { Context, Next } from "hono";
import { MemoryStore } from "../../memory/store.js";
import { extractBearerToken, isValidKeyFormat } from "../utils/auth.js";

// Paths that don't require authentication
// Note: Dashboard removed from public paths for security - requires auth in production
const PUBLIC_PATHS = ["/", "/health"];

/**
 * Check if a path should skip authentication
 */
function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.includes(path);
}

/**
 * Create auth middleware factory
 *
 * SECURITY: Auth is ENABLED by default. Set MAESTRO_API_AUTH_ENABLED=false to disable.
 * This is intentionally opt-out to prevent accidental production deployment without auth.
 */
export function createAuthMiddleware(memoryStore: MemoryStore) {
  // Auth enabled by default - must explicitly set to "false" to disable
  const authEnabled = process.env.MAESTRO_API_AUTH_ENABLED !== "false";

  return async function authMiddleware(c: Context, next: Next) {
    // Skip auth if disabled
    if (!authEnabled) {
      return next();
    }

    // Skip auth for public paths
    if (isPublicPath(c.req.path)) {
      return next();
    }

    // Extract token from Authorization header
    const authHeader = c.req.header("Authorization");
    const token = extractBearerToken(authHeader);

    if (!token) {
      console.warn(`Auth failure: Missing token for ${c.req.method} ${c.req.path}`);
      return c.json({ error: "Missing API key" }, 401);
    }

    // Validate key format
    if (!isValidKeyFormat(token)) {
      console.warn(`Auth failure: Invalid key format for ${c.req.method} ${c.req.path}`);
      return c.json({ error: "Invalid API key format" }, 401);
    }

    // Validate key against database
    const apiKey = memoryStore.validateApiKey(token);

    if (!apiKey) {
      console.warn(`Auth failure: Invalid key for ${c.req.method} ${c.req.path}`);
      return c.json({ error: "Invalid API key" }, 401);
    }

    // Check if key is revoked
    if (apiKey.revokedAt) {
      console.warn(`Auth failure: Revoked key ${apiKey.keyPrefix} for ${c.req.method} ${c.req.path}`);
      return c.json({ error: "API key has been revoked" }, 403);
    }

    // Update last used timestamp
    memoryStore.touchApiKey(apiKey.id);

    // Store key info in context for potential use by routes
    c.set("apiKey", apiKey);

    return next();
  };
}

/**
 * WebSocket auth validation
 * Returns the validated API key record or null
 */
export function validateWebSocketToken(
  memoryStore: MemoryStore,
  token: string | undefined
): boolean {
  const authEnabled = process.env.MAESTRO_API_AUTH_ENABLED !== "false";

  // Skip auth if disabled
  if (!authEnabled) {
    return true;
  }

  if (!token) {
    return false;
  }

  if (!isValidKeyFormat(token)) {
    return false;
  }

  const apiKey = memoryStore.validateApiKey(token);

  if (!apiKey || apiKey.revokedAt) {
    return false;
  }

  memoryStore.touchApiKey(apiKey.id);
  return true;
}
