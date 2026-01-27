import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  extractBearerToken,
  isValidKeyFormat,
} from "../src/api/utils/auth.js";

describe("generateApiKey", () => {
  it("should generate a key with correct format", () => {
    const { key, keyHash, keyPrefix } = generateApiKey();

    expect(key).toMatch(/^msk_[a-f0-9]{64}$/);
    expect(key.length).toBe(68);
    expect(keyPrefix).toBe(key.slice(0, 12));
    expect(keyHash).toBeTruthy();
  });

  it("should generate unique keys", () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();

    expect(key1.key).not.toBe(key2.key);
    expect(key1.keyHash).not.toBe(key2.keyHash);
  });
});

describe("hashApiKey", () => {
  it("should produce consistent hashes", () => {
    const key = "msk_" + "a".repeat(64);
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);

    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different keys", () => {
    const key1 = "msk_" + "a".repeat(64);
    const key2 = "msk_" + "b".repeat(64);

    expect(hashApiKey(key1)).not.toBe(hashApiKey(key2));
  });

  it("should produce a 64-character hex string", () => {
    const key = "msk_" + "a".repeat(64);
    const hash = hashApiKey(key);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("extractBearerToken", () => {
  it("should extract token from valid header", () => {
    const token = extractBearerToken("Bearer msk_abc123");
    expect(token).toBe("msk_abc123");
  });

  it("should handle case-insensitive Bearer", () => {
    const token = extractBearerToken("bearer msk_abc123");
    expect(token).toBe("msk_abc123");
  });

  it("should return null for missing header", () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("should return null for empty header", () => {
    expect(extractBearerToken("")).toBeNull();
  });

  it("should return null for invalid format", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull();
    expect(extractBearerToken("Bearermsk_abc123")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
  });
});

describe("isValidKeyFormat", () => {
  it("should return true for valid key format", () => {
    const validKey = "msk_" + "a".repeat(64);
    expect(isValidKeyFormat(validKey)).toBe(true);
  });

  it("should return true for generated keys", () => {
    const { key } = generateApiKey();
    expect(isValidKeyFormat(key)).toBe(true);
  });

  it("should return false for wrong prefix", () => {
    const invalidKey = "abc_" + "a".repeat(64);
    expect(isValidKeyFormat(invalidKey)).toBe(false);
  });

  it("should return false for wrong length", () => {
    const shortKey = "msk_" + "a".repeat(32);
    const longKey = "msk_" + "a".repeat(100);

    expect(isValidKeyFormat(shortKey)).toBe(false);
    expect(isValidKeyFormat(longKey)).toBe(false);
  });

  it("should return false for non-hex characters", () => {
    const invalidKey = "msk_" + "z".repeat(64);
    expect(isValidKeyFormat(invalidKey)).toBe(false);
  });

  it("should handle uppercase hex characters", () => {
    const uppercaseKey = "msk_" + "A".repeat(64);
    expect(isValidKeyFormat(uppercaseKey)).toBe(true);
  });
});
