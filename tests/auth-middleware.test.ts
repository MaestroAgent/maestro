import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { MemoryStore } from "../src/memory/store.js";
import { MaestroDatabase } from "../src/core/database.js";
import { createAuthMiddleware, validateWebSocketToken } from "../src/api/middleware/auth.js";
import { generateApiKey } from "../src/api/utils/auth.js";

describe("Auth Middleware", () => {
  let database: MaestroDatabase;
  let store: MemoryStore;
  let app: Hono;

  beforeEach(() => {
    vi.stubEnv("MAESTRO_API_AUTH_ENABLED", "true");
    database = new MaestroDatabase(":memory:");
    store = new MemoryStore(database.db);

    app = new Hono();
    app.use("*", createAuthMiddleware(store));
    app.get("/", (c) => c.json({ message: "root" }));
    app.get("/health", (c) => c.json({ message: "healthy" }));
    app.get("/dashboard/test", (c) => c.json({ message: "dashboard" }));
    app.get("/agents", (c) => c.json({ message: "agents" }));
    app.get("/sessions", (c) => c.json({ message: "sessions" }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    database.close();
  });

  describe("public paths", () => {
    it("should allow access to root without auth", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
    });

    it("should allow access to health without auth", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
    });

    // Dashboard is no longer public - requires auth for security (H4)
    it("should require auth for dashboard paths", async () => {
      const res = await app.request("/dashboard/test");
      expect(res.status).toBe(401);
    });
  });

  describe("protected paths", () => {
    it("should return 401 for missing auth header", async () => {
      const res = await app.request("/agents");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Missing API key");
    });

    it("should return 401 for invalid key format", async () => {
      const res = await app.request("/agents", {
        headers: { Authorization: "Bearer invalid-key" },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid API key format");
    });

    it("should return 401 for non-existent key", async () => {
      const invalidKey = "msk_" + "0".repeat(64);
      const res = await app.request("/agents", {
        headers: { Authorization: `Bearer ${invalidKey}` },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid API key");
    });

    it("should allow access with valid key", async () => {
      const { key, keyHash, keyPrefix } = generateApiKey();
      store.createApiKey("Test Key", keyHash, keyPrefix);

      const res = await app.request("/agents", {
        headers: { Authorization: `Bearer ${key}` },
      });
      expect(res.status).toBe(200);
    });

    it("should return 403 for revoked key", async () => {
      const { key, keyHash, keyPrefix } = generateApiKey();
      const record = store.createApiKey("Test Key", keyHash, keyPrefix);
      store.revokeApiKey(record.id);

      const res = await app.request("/agents", {
        headers: { Authorization: `Bearer ${key}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("API key has been revoked");
    });
  });

  describe("auth disabled", () => {
    it("should allow access when auth is disabled", async () => {
      vi.stubEnv("MAESTRO_API_AUTH_ENABLED", "false");

      const disabledApp = new Hono();
      disabledApp.use("*", createAuthMiddleware(store));
      disabledApp.get("/agents", (c) => c.json({ message: "agents" }));

      const res = await disabledApp.request("/agents");
      expect(res.status).toBe(200);
    });
  });
});

describe("validateWebSocketToken", () => {
  let database: MaestroDatabase;
  let store: MemoryStore;

  beforeEach(() => {
    vi.stubEnv("MAESTRO_API_AUTH_ENABLED", "true");
    database = new MaestroDatabase(":memory:");
    store = new MemoryStore(database.db);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    database.close();
  });

  it("should return true when auth is disabled", () => {
    vi.stubEnv("MAESTRO_API_AUTH_ENABLED", "false");
    expect(validateWebSocketToken(store, undefined)).toBe(true);
  });

  it("should return false for missing token when auth enabled", () => {
    expect(validateWebSocketToken(store, undefined)).toBe(false);
  });

  it("should return false for invalid format", () => {
    expect(validateWebSocketToken(store, "invalid")).toBe(false);
  });

  it("should return false for non-existent key", () => {
    const invalidKey = "msk_" + "0".repeat(64);
    expect(validateWebSocketToken(store, invalidKey)).toBe(false);
  });

  it("should return true for valid key", () => {
    const { key, keyHash, keyPrefix } = generateApiKey();
    store.createApiKey("Test Key", keyHash, keyPrefix);

    expect(validateWebSocketToken(store, key)).toBe(true);
  });

  it("should return false for revoked key", () => {
    const { key, keyHash, keyPrefix } = generateApiKey();
    const record = store.createApiKey("Test Key", keyHash, keyPrefix);
    store.revokeApiKey(record.id);

    expect(validateWebSocketToken(store, key)).toBe(false);
  });
});
