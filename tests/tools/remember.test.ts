import { describe, it, expect } from "vitest";
import { rememberTool } from "../../src/tools/builtin/memory.js";
import { AgentContext } from "../../src/core/types.js";

// --- Mock helpers ---

function createMockVectorStore(options: { isDuplicate?: boolean } = {}) {
  return {
    deduplicate: async (_content: string, _threshold: number) =>
      options.isDuplicate ?? false,
    add: async (
      content: string,
      type: string,
      sessionId?: string,
      confidence?: number,
      metadata?: Record<string, unknown>
    ) => "mem-1",
  };
}

function createContext(
  vectorStore?: ReturnType<typeof createMockVectorStore>
): AgentContext {
  return {
    sessionId: "test-session",
    history: [],
    metadata: {},
    services: {
      vectorStore: vectorStore as AgentContext["services"]["vectorStore"],
    },
  };
}

// --- Tests ---

describe("remember tool", () => {
  it("stores memory with correct content and returns success", async () => {
    const store = createMockVectorStore();
    const result = (await rememberTool.execute(
      { content: "User prefers dark mode", type: "preference" },
      createContext(store)
    )) as { success: boolean; memoryId: string; message: string };

    expect(result.success).toBe(true);
    expect(result.memoryId).toBe("mem-1");
    expect(result.message).toContain("Remembered");
  });

  it("passes sessionId from context to vectorStore.add", async () => {
    let capturedSessionId: string | undefined;
    const store = {
      deduplicate: async () => false,
      add: async (
        _content: string,
        _type: string,
        sessionId?: string
      ) => {
        capturedSessionId = sessionId;
        return "mem-1";
      },
    };

    await rememberTool.execute(
      { content: "test fact", type: "fact" },
      createContext(store as ReturnType<typeof createMockVectorStore>)
    );

    expect(capturedSessionId).toBe("test-session");
  });

  it("uses default confidence of 1.0 when not provided", async () => {
    let capturedConfidence: number | undefined;
    const store = {
      deduplicate: async () => false,
      add: async (
        _content: string,
        _type: string,
        _sessionId?: string,
        confidence?: number
      ) => {
        capturedConfidence = confidence;
        return "mem-1";
      },
    };

    await rememberTool.execute(
      { content: "test fact", type: "fact" },
      createContext(store as ReturnType<typeof createMockVectorStore>)
    );

    expect(capturedConfidence).toBe(1.0);
  });

  it("returns duplicate error when dedup check matches", async () => {
    const store = createMockVectorStore({ isDuplicate: true });
    const result = (await rememberTool.execute(
      { content: "User prefers dark mode", type: "preference" },
      createContext(store)
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Similar memory already exists");
  });

  it("returns error when store not provided", async () => {
    const result = (await rememberTool.execute(
      { content: "test", type: "fact" },
      createContext()
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("Memory system not initialized");
  });
});
