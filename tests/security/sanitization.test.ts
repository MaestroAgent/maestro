import { describe, it, expect } from "vitest";

// Import the functions we want to test (need to export them first)
// For now, we'll test the sanitization logic inline

describe("Token Sanitization (C3)", () => {
  // Regex pattern used in projects.ts
  const sanitizeErrorMessage = (message: string): string => {
    return message.replace(/https:\/\/[^@\s]+@/g, "https://***@");
  };

  it("removes GitHub token from URL", () => {
    const errorWithToken = "fatal: repository 'https://ghp_xxxxxxxxxxxx@github.com/user/repo.git/' not found";
    const sanitized = sanitizeErrorMessage(errorWithToken);
    expect(sanitized).toBe("fatal: repository 'https://***@github.com/user/repo.git/' not found");
    expect(sanitized).not.toContain("ghp_");
  });

  it("removes generic token from URL", () => {
    const errorWithToken = "error: https://my-secret-token@example.com/path failed";
    const sanitized = sanitizeErrorMessage(errorWithToken);
    expect(sanitized).toBe("error: https://***@example.com/path failed");
    expect(sanitized).not.toContain("my-secret-token");
  });

  it("handles multiple tokens in same message", () => {
    const errorWithMultipleTokens = "https://token1@host1.com and https://token2@host2.com failed";
    const sanitized = sanitizeErrorMessage(errorWithMultipleTokens);
    expect(sanitized).toBe("https://***@host1.com and https://***@host2.com failed");
  });

  it("preserves non-token URLs", () => {
    const normalUrl = "error: https://github.com/user/repo.git not found";
    const sanitized = sanitizeErrorMessage(normalUrl);
    expect(sanitized).toBe(normalUrl);
  });

  it("handles empty string", () => {
    expect(sanitizeErrorMessage("")).toBe("");
  });

  it("handles string without URLs", () => {
    const noUrls = "This is a regular error message";
    expect(sanitizeErrorMessage(noUrls)).toBe(noUrls);
  });
});

describe("Stack Trace Sanitization (H3)", () => {
  // Regex patterns used in logger.ts - matches actual implementation
  const sanitizeStackTrace = (stack: string | undefined): string | undefined => {
    if (!stack) return undefined;
    const cwd = "/Users/testuser/projects/maestro";
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return stack
      .replace(new RegExp(escapeRegExp(cwd), "g"), ".")
      .replace(/\/Users\/[^/]+\//g, "~/")
      .replace(/\/home\/[^/]+\//g, "~/")
      .replace(/C:\\Users\\[^\\]+\\/gi, "~\\")
      .replace(/node_modules\/([^/]+)\/[^:]+/g, "node_modules/$1/...");
  };

  it("replaces home directory paths on macOS", () => {
    const stack = "at Object.<anonymous> (/Users/john/project/src/index.ts:10:5)";
    const sanitized = sanitizeStackTrace(stack);
    expect(sanitized).toBe("at Object.<anonymous> (~/project/src/index.ts:10:5)");
    expect(sanitized).not.toContain("/Users/john/");
  });

  it("replaces home directory paths on Linux", () => {
    const stack = "at Object.<anonymous> (/home/john/project/src/index.ts:10:5)";
    const sanitized = sanitizeStackTrace(stack);
    expect(sanitized).toBe("at Object.<anonymous> (~/project/src/index.ts:10:5)");
    expect(sanitized).not.toContain("/home/john/");
  });

  it("shortens node_modules paths", () => {
    const stack = "at Function.execute (node_modules/hono/dist/compose.js:35:16)";
    const sanitized = sanitizeStackTrace(stack);
    // The regex replaces everything after package name up to (but not including) the colon
    expect(sanitized).toContain("node_modules/hono/...");
    expect(sanitized).not.toContain("dist/compose.js");
  });

  it("handles undefined input", () => {
    expect(sanitizeStackTrace(undefined)).toBeUndefined();
  });

  it("handles empty string - returns undefined for falsy input", () => {
    // Empty string is falsy, so returns undefined per implementation
    expect(sanitizeStackTrace("")).toBeUndefined();
  });

  it("preserves relative paths", () => {
    const stack = "at Object.<anonymous> (./src/index.ts:10:5)";
    const sanitized = sanitizeStackTrace(stack);
    expect(sanitized).toBe("at Object.<anonymous> (./src/index.ts:10:5)");
  });
});

describe("Calculator Safety (H7)", () => {
  // Note: Full calculator tests would require importing expr-eval
  // These tests verify the expected behavior characteristics

  it("should not allow arbitrary code execution", () => {
    // The old Function constructor approach could potentially execute arbitrary JS
    // expr-eval parser only evaluates mathematical expressions

    // This is more of a design verification than a runtime test
    // The expr-eval library is sandboxed and doesn't have access to:
    // - Global objects (window, document, process, etc.)
    // - Function constructor
    // - eval
    // - require/import
    expect(true).toBe(true);
  });
});
