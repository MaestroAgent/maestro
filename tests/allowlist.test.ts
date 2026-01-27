import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseAllowlist,
  isAllowed,
  isAllowedTelegramUser,
  isAllowedSlackUser,
  resetAllowlistCache,
} from "../src/channels/utils/allowlist.js";

describe("parseAllowlist", () => {
  it("should return null for undefined input", () => {
    expect(parseAllowlist(undefined)).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseAllowlist("")).toBeNull();
    expect(parseAllowlist("   ")).toBeNull();
  });

  it("should parse single ID", () => {
    const result = parseAllowlist("123456");
    expect(result).toBeInstanceOf(Set);
    expect(result?.size).toBe(1);
    expect(result?.has("123456")).toBe(true);
  });

  it("should parse multiple comma-separated IDs", () => {
    const result = parseAllowlist("123,456,789");
    expect(result?.size).toBe(3);
    expect(result?.has("123")).toBe(true);
    expect(result?.has("456")).toBe(true);
    expect(result?.has("789")).toBe(true);
  });

  it("should trim whitespace around IDs", () => {
    const result = parseAllowlist(" 123 , 456 , 789 ");
    expect(result?.size).toBe(3);
    expect(result?.has("123")).toBe(true);
    expect(result?.has("456")).toBe(true);
    expect(result?.has("789")).toBe(true);
  });

  it("should filter out empty entries", () => {
    const result = parseAllowlist("123,,456,  ,789");
    expect(result?.size).toBe(3);
  });
});

describe("isAllowed", () => {
  it("should return true when allowlist is null", () => {
    expect(isAllowed("any-id", null)).toBe(true);
  });

  it("should return true when ID is in allowlist", () => {
    const allowlist = new Set(["123", "456"]);
    expect(isAllowed("123", allowlist)).toBe(true);
    expect(isAllowed("456", allowlist)).toBe(true);
  });

  it("should return false when ID is not in allowlist", () => {
    const allowlist = new Set(["123", "456"]);
    expect(isAllowed("789", allowlist)).toBe(false);
  });

  it("should convert numbers to strings for comparison", () => {
    const allowlist = new Set(["123"]);
    expect(isAllowed("123", allowlist)).toBe(true);
  });
});

describe("isAllowedTelegramUser", () => {
  const originalEnv = process.env.MAESTRO_TELEGRAM_ALLOWED_USERS;

  beforeEach(() => {
    resetAllowlistCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MAESTRO_TELEGRAM_ALLOWED_USERS;
    } else {
      process.env.MAESTRO_TELEGRAM_ALLOWED_USERS = originalEnv;
    }
    resetAllowlistCache();
  });

  it("should allow all users when env var is not set", () => {
    delete process.env.MAESTRO_TELEGRAM_ALLOWED_USERS;
    expect(isAllowedTelegramUser(123456)).toBe(true);
    expect(isAllowedTelegramUser(789012)).toBe(true);
  });

  it("should allow only listed users when env var is set", () => {
    process.env.MAESTRO_TELEGRAM_ALLOWED_USERS = "123456,789012";
    expect(isAllowedTelegramUser(123456)).toBe(true);
    expect(isAllowedTelegramUser(789012)).toBe(true);
    expect(isAllowedTelegramUser(111111)).toBe(false);
  });

  it("should handle string chat IDs", () => {
    process.env.MAESTRO_TELEGRAM_ALLOWED_USERS = "123456";
    expect(isAllowedTelegramUser("123456")).toBe(true);
    expect(isAllowedTelegramUser("789012")).toBe(false);
  });
});

describe("isAllowedSlackUser", () => {
  const originalEnv = process.env.MAESTRO_SLACK_ALLOWED_USERS;

  beforeEach(() => {
    resetAllowlistCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MAESTRO_SLACK_ALLOWED_USERS;
    } else {
      process.env.MAESTRO_SLACK_ALLOWED_USERS = originalEnv;
    }
    resetAllowlistCache();
  });

  it("should allow all users when env var is not set", () => {
    delete process.env.MAESTRO_SLACK_ALLOWED_USERS;
    expect(isAllowedSlackUser("U12345678")).toBe(true);
    expect(isAllowedSlackUser("U87654321")).toBe(true);
  });

  it("should allow only listed users when env var is set", () => {
    process.env.MAESTRO_SLACK_ALLOWED_USERS = "U12345678,U87654321";
    expect(isAllowedSlackUser("U12345678")).toBe(true);
    expect(isAllowedSlackUser("U87654321")).toBe(true);
    expect(isAllowedSlackUser("U00000000")).toBe(false);
  });
});
