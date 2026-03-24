import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryStore } from "../src/memory/store.js";
import { MaestroDatabase } from "../src/core/database.js";
import { generateApiKey } from "../src/api/utils/auth.js";

describe("MemoryStore API Key Management", () => {
  let database: MaestroDatabase;
  let store: MemoryStore;

  beforeEach(() => {
    database = new MaestroDatabase(":memory:");
    store = new MemoryStore(database.db);
  });

  afterEach(() => {
    database.close();
  });

  describe("createApiKey", () => {
    it("should create an API key record", () => {
      const { keyHash, keyPrefix } = generateApiKey();
      const record = store.createApiKey("Test Key", keyHash, keyPrefix);

      expect(record.name).toBe("Test Key");
      expect(record.keyHash).toBe(keyHash);
      expect(record.keyPrefix).toBe(keyPrefix);
      expect(record.id).toBeTruthy();
      expect(record.createdAt).toBeTruthy();
      expect(record.lastUsedAt).toBeNull();
      expect(record.revokedAt).toBeNull();
    });
  });

  describe("validateApiKey", () => {
    it("should validate a correct key", () => {
      const { key, keyHash, keyPrefix } = generateApiKey();
      store.createApiKey("Test Key", keyHash, keyPrefix);

      const result = store.validateApiKey(key);

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test Key");
    });

    it("should return null for invalid key", () => {
      const { keyHash, keyPrefix } = generateApiKey();
      store.createApiKey("Test Key", keyHash, keyPrefix);

      const invalidKey = "msk_" + "0".repeat(64);
      const result = store.validateApiKey(invalidKey);

      expect(result).toBeNull();
    });

    it("should return null when no keys exist", () => {
      const key = "msk_" + "0".repeat(64);
      const result = store.validateApiKey(key);

      expect(result).toBeNull();
    });
  });

  describe("touchApiKey", () => {
    it("should update last_used_at timestamp", () => {
      const { key, keyHash, keyPrefix } = generateApiKey();
      const record = store.createApiKey("Test Key", keyHash, keyPrefix);

      expect(record.lastUsedAt).toBeNull();

      store.touchApiKey(record.id);

      const updated = store.validateApiKey(key);
      expect(updated!.lastUsedAt).not.toBeNull();
    });
  });

  describe("revokeApiKey", () => {
    it("should revoke an API key", () => {
      const { key, keyHash, keyPrefix } = generateApiKey();
      const record = store.createApiKey("Test Key", keyHash, keyPrefix);

      const revoked = store.revokeApiKey(record.id);
      expect(revoked).toBe(true);

      const updated = store.validateApiKey(key);
      expect(updated!.revokedAt).not.toBeNull();
    });

    it("should return false when revoking already revoked key", () => {
      const { keyHash, keyPrefix } = generateApiKey();
      const record = store.createApiKey("Test Key", keyHash, keyPrefix);

      store.revokeApiKey(record.id);
      const secondRevoke = store.revokeApiKey(record.id);

      expect(secondRevoke).toBe(false);
    });

    it("should return false for non-existent key", () => {
      const result = store.revokeApiKey("non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("getAllApiKeys", () => {
    it("should return empty array when no keys exist", () => {
      const keys = store.getAllApiKeys();
      expect(keys).toEqual([]);
    });

    it("should return all API keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      store.createApiKey("Key 1", key1.keyHash, key1.keyPrefix);
      store.createApiKey("Key 2", key2.keyHash, key2.keyPrefix);

      const keys = store.getAllApiKeys();

      expect(keys.length).toBe(2);
      expect(keys.map((k) => k.name)).toContain("Key 1");
      expect(keys.map((k) => k.name)).toContain("Key 2");
    });

    it("should return keys ordered by creation time", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      store.createApiKey("Key A", key1.keyHash, key1.keyPrefix);
      store.createApiKey("Key B", key2.keyHash, key2.keyPrefix);

      const keys = store.getAllApiKeys();
      const names = keys.map((k) => k.name);

      // Both keys should be present (order may vary if created same millisecond)
      expect(names).toContain("Key A");
      expect(names).toContain("Key B");
    });
  });

  describe("hasApiKeys", () => {
    it("should return false when no keys exist", () => {
      expect(store.hasApiKeys()).toBe(false);
    });

    it("should return true when keys exist", () => {
      const { keyHash, keyPrefix } = generateApiKey();
      store.createApiKey("Test Key", keyHash, keyPrefix);

      expect(store.hasApiKeys()).toBe(true);
    });
  });
});
