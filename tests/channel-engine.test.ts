import { describe, it, expect, vi } from "vitest";
import { ChannelEngine } from "../src/channels/engine.js";
import type { AgentContext, StreamChunk } from "../src/core/types.js";
import type { MemoryStore } from "../src/memory/store.js";
import type { Agent } from "../src/core/agent.js";

function createMockMemoryStore() {
  let sessionCounter = 0;
  return {
    getOrCreateSession: vi.fn((channel: string, userId: string) => ({
      id: `session-${++sessionCounter}`,
      channel,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    createContext: vi.fn(
      (session: { id: string; channel: string; userId: string }) =>
        ({
          sessionId: session.id,
          history: [],
          metadata: { channel: session.channel, userId: session.userId },
          services: {},
        }) as AgentContext
    ),
    syncContext: vi.fn(),
    updateSessionMetadata: vi.fn(),
  } as unknown as MemoryStore & {
    getOrCreateSession: ReturnType<typeof vi.fn>;
    createContext: ReturnType<typeof vi.fn>;
    syncContext: ReturnType<typeof vi.fn>;
    updateSessionMetadata: ReturnType<typeof vi.fn>;
  };
}

function createMockOrchestrator(chunks: StreamChunk[]) {
  return {
    async *run(_input: string): AsyncGenerator<StreamChunk> {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as Agent;
}

describe("ChannelEngine", () => {
  it("creates a new session on first message", async () => {
    const store = createMockMemoryStore();
    const chunks: StreamChunk[] = [{ type: "text", text: "hello" }];
    const engine = new ChannelEngine(
      () => createMockOrchestrator(chunks),
      store
    );

    const result: StreamChunk[] = [];
    for await (const chunk of engine.run("telegram", "user-1", "hi")) {
      result.push(chunk);
    }

    expect(store.getOrCreateSession).toHaveBeenCalledWith(
      "telegram",
      "user-1",
      undefined
    );
    expect(store.createContext).toHaveBeenCalledOnce();
  });

  it("returns cached session on subsequent messages", async () => {
    const store = createMockMemoryStore();
    const chunks: StreamChunk[] = [{ type: "text", text: "hello" }];
    const engine = new ChannelEngine(
      () => createMockOrchestrator(chunks),
      store
    );

    for await (const _chunk of engine.run("telegram", "user-1", "hi")) {
      // consume
    }
    for await (const _chunk of engine.run("telegram", "user-1", "hello")) {
      // consume
    }

    expect(store.getOrCreateSession).toHaveBeenCalledTimes(1);
    expect(store.createContext).toHaveBeenCalledTimes(1);
  });

  it("yields all chunks from the orchestrator", async () => {
    const store = createMockMemoryStore();
    const chunks: StreamChunk[] = [
      { type: "text", text: "Hello" },
      { type: "text", text: " world" },
      { type: "done", fullText: "Hello world" },
    ];
    const engine = new ChannelEngine(
      () => createMockOrchestrator(chunks),
      store
    );

    const result: StreamChunk[] = [];
    for await (const chunk of engine.run("cli", "user-1", "test")) {
      result.push(chunk);
    }

    expect(result).toEqual(chunks);
  });

  it("syncs context and metadata after consumption", async () => {
    const store = createMockMemoryStore();
    const chunks: StreamChunk[] = [{ type: "text", text: "done" }];
    const engine = new ChannelEngine(
      () => createMockOrchestrator(chunks),
      store
    );

    for await (const _chunk of engine.run("slack", "team-chan-user", "msg")) {
      expect(store.syncContext).not.toHaveBeenCalled();
    }

    expect(store.syncContext).toHaveBeenCalledOnce();
    expect(store.updateSessionMetadata).toHaveBeenCalledOnce();
  });

  it("isolates sessions for different channel/userId pairs", async () => {
    const store = createMockMemoryStore();
    const chunks: StreamChunk[] = [{ type: "text", text: "ok" }];
    const engine = new ChannelEngine(
      () => createMockOrchestrator(chunks),
      store
    );

    for await (const _chunk of engine.run("telegram", "user-1", "a")) {
      // consume
    }
    for await (const _chunk of engine.run("slack", "user-2", "b")) {
      // consume
    }
    for await (const _chunk of engine.run("telegram", "user-1", "c")) {
      // consume - should reuse cached session
    }

    expect(store.getOrCreateSession).toHaveBeenCalledTimes(2);
    expect(store.getOrCreateSession).toHaveBeenCalledWith(
      "telegram",
      "user-1",
      undefined
    );
    expect(store.getOrCreateSession).toHaveBeenCalledWith(
      "slack",
      "user-2",
      undefined
    );
  });
});
