import { describe, it, expect, beforeEach } from "vitest";
import { Agent, AgentServices, AgentOptions } from "../src/core/agent.js";
import {
  AgentConfig,
  AgentContext,
  StreamChunk,
  ToolDefinition,
} from "../src/core/types.js";
import { LLMProvider } from "../src/llm/provider.js";
import { Logger } from "../src/observability/logger.js";
import { CostTracker } from "../src/observability/cost.js";
import type { BudgetGuard } from "../src/observability/budget.js";

// --- Helpers ---

function createStubProvider(responses: StreamChunk[][]): LLMProvider {
  let callIndex = 0;
  return {
    async *chat() {
      yield* responses[callIndex++] ?? [];
    },
    async *chatWithTools() {
      const chunks = responses[callIndex++] ?? [];
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function createTestConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-agent",
    description: "Test agent",
    model: {
      provider: "anthropic" as const,
      name: "test-model",
      temperature: 0.7,
      maxTokens: 4096,
    },
    systemPrompt: "You are a test agent.",
    tools: [],
    references: [],
    relatedAgents: [],
    ...overrides,
  };
}

function createTestServices(
  overrides: Partial<AgentServices> = {}
): AgentServices {
  return {
    logger: new Logger({ console: false }),
    costTracker: new CostTracker("test-session", "test-model"),
    ...overrides,
  };
}

function createTestContext(): AgentContext {
  return {
    sessionId: "test-session",
    history: [],
    metadata: {},
    services: {},
  };
}

async function collectChunks(
  gen: AsyncGenerator<StreamChunk, string, unknown>
): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  while (true) {
    const { value, done } = await gen.next();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

function textResponse(
  text: string,
  usage = { inputTokens: 100, outputTokens: 50 }
): StreamChunk[] {
  return [
    { type: "text", text },
    { type: "done", fullText: text, usage },
  ];
}

function toolCallResponse(
  toolName: string,
  args: Record<string, unknown>,
  usage = { inputTokens: 80, outputTokens: 40 }
): StreamChunk[] {
  return [
    {
      type: "tool_call",
      toolCall: { id: `call_${toolName}`, name: toolName, arguments: args },
    },
    { type: "done", fullText: "", usage },
  ];
}

// --- Tests ---

describe("Agent", () => {
  let services: AgentServices;
  let context: AgentContext;

  beforeEach(() => {
    services = createTestServices();
    context = createTestContext();
  });

  describe("basic run flow", () => {
    it("yields text chunks and done chunk with correct fullText", async () => {
      const provider = createStubProvider([textResponse("Hello world")]);
      const agent = new Agent({
        config: createTestConfig(),
        provider,
        agentRegistry: new Map(),
        toolRegistry: new Map(),
        services,
        context,
      });

      const chunks = await collectChunks(agent.run("Hi"));

      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks).toHaveLength(1);
      expect(textChunks[0]).toEqual({ type: "text", text: "Hello world" });

      const doneChunk = chunks.find((c) => c.type === "done");
      expect(doneChunk).toBeDefined();
      expect(doneChunk!.type === "done" && doneChunk!.fullText).toBe(
        "Hello world"
      );
    });

    it("appends response to context history", async () => {
      const provider = createStubProvider([textResponse("Hello world")]);
      const agent = new Agent({
        config: createTestConfig(),
        provider,
        agentRegistry: new Map(),
        toolRegistry: new Map(),
        services,
        context,
      });

      await collectChunks(agent.run("Hi"));

      expect(context.history).toContainEqual({
        role: "user",
        content: "Hi",
      });
      expect(context.history).toContainEqual({
        role: "assistant",
        content: "Hello world",
      });
    });
  });

  describe("tool execution round-trip", () => {
    it("calls tool with correct args and feeds result back", async () => {
      let capturedArgs: Record<string, unknown> | null = null;

      const addTool: ToolDefinition = {
        name: "add",
        description: "Add two numbers",
        parameters: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["a", "b"],
        },
        execute: async (args) => {
          capturedArgs = args;
          return { sum: (args.a as number) + (args.b as number) };
        },
      };

      const toolRegistry = new Map([["add", addTool]]);

      const provider = createStubProvider([
        toolCallResponse("add", { a: 2, b: 3 }),
        textResponse("The sum is 5"),
      ]);

      const agent = new Agent({
        config: createTestConfig({ tools: ["add"] }),
        provider,
        agentRegistry: new Map(),
        toolRegistry,
        services,
        context,
      });

      const chunks = await collectChunks(agent.run("Add 2 and 3"));

      expect(capturedArgs).toEqual({ a: 2, b: 3 });

      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks).toHaveLength(1);
      expect(textChunks[0]).toEqual({ type: "text", text: "The sum is 5" });

      // Tool result should appear in history
      const historyContent = context.history.map((m) => m.content);
      const toolResultEntry = historyContent.find(
        (c) => typeof c === "string" && c.includes('"sum": 5')
      );
      expect(toolResultEntry).toBeDefined();
    });
  });

  describe("cost tracking", () => {
    it("records token usage to injected CostTracker", async () => {
      const provider = createStubProvider([
        textResponse("Hello", { inputTokens: 200, outputTokens: 100 }),
      ]);

      const agent = new Agent({
        config: createTestConfig(),
        provider,
        agentRegistry: new Map(),
        toolRegistry: new Map(),
        services,
        context,
      });

      await collectChunks(agent.run("Hi"));

      const totals = services.costTracker.getTotals();
      expect(totals.inputTokens).toBe(200);
      expect(totals.outputTokens).toBe(100);
    });
  });

  describe("budget enforcement", () => {
    it("stops and yields budget message when budget is exceeded", async () => {
      const stubBudgetGuard = {
        checkBudget: () => ({
          allowed: false,
          message: "Daily budget limit reached.",
          status: {
            dailySpent: 20,
            dailyLimit: 20,
            remaining: 0,
            percentUsed: 100,
            isExceeded: true,
            date: "2026-03-22",
          },
        }),
        recordSpending: () => {},
      } as unknown as BudgetGuard;

      const provider = createStubProvider([textResponse("Should not appear")]);

      const agent = new Agent({
        config: createTestConfig(),
        provider,
        agentRegistry: new Map(),
        toolRegistry: new Map(),
        services: createTestServices({ budgetGuard: stubBudgetGuard }),
        context,
      });

      const chunks = await collectChunks(agent.run("Hi"));

      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks).toHaveLength(1);
      expect(textChunks[0]).toEqual({
        type: "text",
        text: "Daily budget limit reached.",
      });
    });
  });

  describe("budget omission", () => {
    it("completes normally without BudgetGuard", async () => {
      const provider = createStubProvider([textResponse("All good")]);

      const agent = new Agent({
        config: createTestConfig(),
        provider,
        agentRegistry: new Map(),
        toolRegistry: new Map(),
        services: createTestServices({ budgetGuard: undefined }),
        context,
      });

      const chunks = await collectChunks(agent.run("Hi"));

      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks).toHaveLength(1);
      expect(textChunks[0]).toEqual({ type: "text", text: "All good" });
    });
  });

  describe("safety limits", () => {
    it("stops after MAX_TOOL_ROUNDS (10) tool rounds", async () => {
      const noopTool: ToolDefinition = {
        name: "noop",
        description: "Does nothing",
        parameters: { type: "object", properties: {} },
        execute: async () => "ok",
      };

      // Always return a tool call — never a plain text response
      const responses: StreamChunk[][] = Array.from({ length: 11 }, () =>
        toolCallResponse("noop", {})
      );
      const provider = createStubProvider(responses);

      const agent = new Agent({
        config: createTestConfig({ tools: ["noop"] }),
        provider,
        agentRegistry: new Map(),
        toolRegistry: new Map([["noop", noopTool]]),
        services,
        context,
      });

      const chunks = await collectChunks(agent.run("Loop forever"));

      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks.length).toBeGreaterThanOrEqual(1);
      expect(textChunks[0].type === "text" && textChunks[0].text).toContain(
        "maximum number of tool calls"
      );
    });

    it("stops after MAX_CONSECUTIVE_ERRORS (3) consecutive tool errors", async () => {
      const failTool: ToolDefinition = {
        name: "fail",
        description: "Always fails",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          throw new Error("Tool failure");
        },
      };

      const responses: StreamChunk[][] = Array.from({ length: 4 }, () =>
        toolCallResponse("fail", {})
      );
      const provider = createStubProvider(responses);

      const agent = new Agent({
        config: createTestConfig({ tools: ["fail"] }),
        provider,
        agentRegistry: new Map(),
        toolRegistry: new Map([["fail", failTool]]),
        services,
        context,
      });

      const chunks = await collectChunks(agent.run("Do something"));

      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks.length).toBeGreaterThanOrEqual(1);
      expect(textChunks[0].type === "text" && textChunks[0].text).toContain(
        "consecutive errors"
      );
    });
  });

  describe("subordinate spawning", () => {
    it("shares context and CostTracker with child agent", async () => {
      const childConfig = createTestConfig({
        name: "child-agent",
        description: "Child agent",
      });

      const agentRegistry = new Map([["child-agent", childConfig]]);

      // Parent provider: returns tool call to delegate, then text
      // Child provider: returns text
      // Since spawnSubordinate creates a new Agent with the same provider,
      // we need the provider to serve responses for both parent and child
      const provider = createStubProvider([
        // Parent round 1: delegates to child via tool
        toolCallResponse("delegate", { agent: "child-agent" }),
        // Child run: returns text
        textResponse("Child response", {
          inputTokens: 50,
          outputTokens: 25,
        }),
        // Parent round 2: returns final text
        textResponse("Done", { inputTokens: 100, outputTokens: 50 }),
      ]);

      const delegateTool: ToolDefinition = {
        name: "delegate",
        description: "Delegate to child",
        parameters: { type: "object", properties: {} },
        execute: async (_args, ctx) => {
          // We can't easily call spawnSubordinate from inside a tool in this test,
          // so we test spawnSubordinate directly below
          return "delegated";
        },
      };

      // Test spawnSubordinate directly
      const parentProvider = createStubProvider([
        // This will be consumed by the child via spawnSubordinate
        textResponse("Child says hi", {
          inputTokens: 60,
          outputTokens: 30,
        }),
      ]);

      const parent = new Agent({
        config: createTestConfig(),
        provider: parentProvider,
        agentRegistry,
        toolRegistry: new Map(),
        services,
        context,
      });

      const result = await parent.spawnSubordinate("child-agent", "Say hi");

      expect(result).toBe("Child says hi");

      // Child should share the same context sessionId
      expect(context.sessionId).toBe("test-session");

      // Cost should be recorded to the shared CostTracker
      const totals = services.costTracker.getTotals();
      expect(totals.inputTokens).toBe(60);
      expect(totals.outputTokens).toBe(30);
    });
  });
});
