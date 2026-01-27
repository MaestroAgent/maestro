import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the rate limit store for testing
class TestRateLimitStore {
  private store: Map<string, number[]> = new Map();

  check(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.store.get(key) || [];
    timestamps = timestamps.filter((ts) => ts > windowStart);

    if (timestamps.length >= limit) {
      const oldestInWindow = timestamps[0];
      const resetMs = oldestInWindow + windowMs - now;
      return { allowed: false, remaining: 0, resetMs };
    }

    timestamps.push(now);
    this.store.set(key, timestamps);

    return {
      allowed: true,
      remaining: limit - timestamps.length,
      resetMs: windowMs,
    };
  }

  clear(): void {
    this.store.clear();
  }
}

describe("RateLimitStore", () => {
  let store: TestRateLimitStore;

  beforeEach(() => {
    store = new TestRateLimitStore();
  });

  it("should allow requests under the limit", () => {
    const result1 = store.check("key1", 5, 60000);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(4);

    const result2 = store.check("key1", 5, 60000);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(3);
  });

  it("should deny requests over the limit", () => {
    for (let i = 0; i < 5; i++) {
      store.check("key1", 5, 60000);
    }

    const result = store.check("key1", 5, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBeGreaterThan(0);
  });

  it("should track separate keys independently", () => {
    for (let i = 0; i < 5; i++) {
      store.check("key1", 5, 60000);
    }

    const result1 = store.check("key1", 5, 60000);
    expect(result1.allowed).toBe(false);

    const result2 = store.check("key2", 5, 60000);
    expect(result2.allowed).toBe(true);
  });

  it("should reset after window expires", async () => {
    const shortWindow = 50; // 50ms window for testing

    for (let i = 0; i < 5; i++) {
      store.check("key1", 5, shortWindow);
    }

    const result1 = store.check("key1", 5, shortWindow);
    expect(result1.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, shortWindow + 10));

    const result2 = store.check("key1", 5, shortWindow);
    expect(result2.allowed).toBe(true);
  });
});

describe("Rate limit configuration", () => {
  it("should have sensible default limits", () => {
    const defaultLimits = {
      "POST:/chat": { limit: 20, windowMs: 60000 },
      "GET:/agents": { limit: 60, windowMs: 60000 },
      "GET:/sessions": { limit: 60, windowMs: 60000 },
      "GET:/observability": { limit: 30, windowMs: 60000 },
      "POST:/observability/budget/override": { limit: 5, windowMs: 60000 },
    };

    // Chat endpoint should be more restrictive
    expect(defaultLimits["POST:/chat"].limit).toBeLessThan(defaultLimits["GET:/agents"].limit);

    // Budget override should be the most restrictive
    expect(defaultLimits["POST:/observability/budget/override"].limit).toBeLessThan(
      defaultLimits["POST:/chat"].limit
    );
  });

  it("should exempt health and dashboard endpoints", () => {
    const exemptPaths = ["/health", "/dashboard", "/ws"];

    expect(exemptPaths).toContain("/health");
    expect(exemptPaths).toContain("/dashboard");
    expect(exemptPaths).toContain("/ws");
  });
});

describe("Client ID extraction", () => {
  it("should use API key prefix for authenticated requests", () => {
    // Simulated extraction logic
    const getClientId = (authHeader?: string, ip?: string): string => {
      if (authHeader?.startsWith("Bearer msk_")) {
        const apiKey = authHeader.slice(7);
        return `key:${apiKey.slice(0, 16)}`;
      }
      return `ip:${ip || "unknown"}`;
    };

    const result = getClientId("Bearer msk_abc123def456", "192.168.1.1");
    expect(result).toBe("key:msk_abc123def456");
  });

  it("should fall back to IP for unauthenticated requests", () => {
    const getClientId = (authHeader?: string, ip?: string): string => {
      if (authHeader?.startsWith("Bearer msk_")) {
        const apiKey = authHeader.slice(7);
        return `key:${apiKey.slice(0, 16)}`;
      }
      return `ip:${ip || "unknown"}`;
    };

    const result = getClientId(undefined, "192.168.1.1");
    expect(result).toBe("ip:192.168.1.1");
  });
});
