import { defineTool } from "../registry.js";
import { MemoryType } from "../../memory/types.js";
import {
  flushMemories,
  shouldFlush,
  estimateHistoryTokens,
} from "../../memory/flush.js";

export const rememberTool = defineTool(
  "remember",
  "Store a piece of information in long-term memory for future recall. Use this to remember facts, user preferences, context, or learnings that should persist across conversations.",
  {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The information to remember. Should be a clear, self-contained statement.",
      },
      type: {
        type: "string",
        enum: ["fact", "preference", "context", "learning"],
        description:
          "The type of memory: 'fact' for factual information, 'preference' for user preferences, 'context' for situational context, 'learning' for insights or lessons learned.",
      },
      confidence: {
        type: "number",
        description:
          "Confidence level from 0 to 1 (default 1.0). Lower confidence for uncertain information.",
      },
    },
    required: ["content", "type"],
  },
  async (args, context) => {
    const vectorStore = context.services.vectorStore;
    if (!vectorStore) {
      return { success: false, error: "Memory system not initialized" };
    }

    const content = args.content as string;
    const type = args.type as MemoryType;
    const confidence = (args.confidence as number) ?? 1.0;

    // Check for duplicates
    const isDuplicate = await vectorStore.deduplicate(content, 0.9);
    if (isDuplicate) {
      return {
        success: false,
        error: "Similar memory already exists",
        suggestion:
          "Use 'recall' to find existing memories or rephrase the content.",
      };
    }

    const id = await vectorStore.add(
      content,
      type,
      context.sessionId,
      confidence,
      { source: "remember_tool" }
    );

    return {
      success: true,
      memoryId: id,
      message: `Remembered: "${content.slice(0, 50)}${content.length > 50 ? "..." : ""}"`,
    };
  }
);

export const recallTool = defineTool(
  "recall",
  "Search long-term memory for relevant information. Use this to retrieve facts, preferences, context, or learnings that were previously stored.",
  {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "What to search for in memory. Can be a question or keywords.",
      },
      limit: {
        type: "number",
        description: "Maximum number of memories to retrieve (default 5).",
      },
      type: {
        type: "string",
        enum: ["fact", "preference", "context", "learning"],
        description:
          "Filter by a single memory type. If not specified, searches all types.",
      },
      hybrid: {
        type: "boolean",
        description:
          "Use hybrid search combining semantic similarity with keyword matching. Better for exact IDs, code symbols, and error messages. Default: false.",
      },
      global: {
        type: "boolean",
        description:
          "Search across all sessions, not just the current session. Useful for finding memories from past conversations. Default: false.",
      },
    },
    required: ["query"],
  },
  async (args, context) => {
    const vectorStore = context.services.vectorStore;
    if (!vectorStore) {
      return { success: false, error: "Memory system not initialized" };
    }

    const query = args.query as string;
    const limit = (args.limit as number) ?? 5;
    const type = args.type as MemoryType | undefined;
    const types = type ? [type] : undefined;
    const useHybrid = (args.hybrid as boolean) ?? false;
    const globalSearch = (args.global as boolean) ?? false;

    // Use undefined for sessionId to search globally, or current session
    const sessionId = globalSearch ? undefined : context.sessionId;

    // Choose search method
    const results = useHybrid
      ? await vectorStore.searchHybrid(query, limit, sessionId, types)
      : await vectorStore.search(query, limit, sessionId, types);

    if (results.length === 0) {
      return {
        success: true,
        memories: [],
        message: "No relevant memories found.",
      };
    }

    return {
      success: true,
      memories: results.map((r) => ({
        id: r.memory.id,
        content: r.memory.content,
        type: r.memory.type,
        confidence: r.memory.confidence,
        relevance: Math.round(r.score * 100),
        createdAt: r.memory.createdAt,
        sessionId: r.memory.sessionId,
      })),
      message: `Found ${results.length} relevant ${results.length === 1 ? "memory" : "memories"}.`,
      searchMode: useHybrid ? "hybrid" : "semantic",
      scope: globalSearch ? "global" : "session",
    };
  }
);

export const forgetTool = defineTool(
  "forget",
  "Remove a specific memory from long-term storage. Use this to delete outdated, incorrect, or unwanted memories.",
  {
    type: "object",
    properties: {
      memoryId: {
        type: "string",
        description: "The ID of the memory to forget (obtained from recall).",
      },
    },
    required: ["memoryId"],
  },
  async (args, context) => {
    const vectorStore = context.services.vectorStore;
    if (!vectorStore) {
      return { success: false, error: "Memory system not initialized" };
    }

    const memoryId = args.memoryId as string;

    // Get memory before deleting to confirm what was deleted
    const memory = vectorStore.getMemory(memoryId);
    if (!memory) {
      return {
        success: false,
        error: "Memory not found. It may have already been deleted.",
      };
    }

    const deleted = vectorStore.delete(memoryId);

    return {
      success: deleted,
      message: deleted
        ? `Forgot: "${memory.content.slice(0, 50)}${memory.content.length > 50 ? "..." : ""}"`
        : "Failed to delete memory.",
    };
  }
);

export const memoryStatsTool = defineTool(
  "memory_stats",
  "Get statistics about stored memories.",
  {
    type: "object",
    properties: {},
  },
  async (_args, context) => {
    const vectorStore = context.services.vectorStore;
    if (!vectorStore) {
      return { success: false, error: "Memory system not initialized" };
    }

    const stats = vectorStore.getStats();

    return {
      success: true,
      totalMemories: stats.total,
      byType: stats.byType,
      sessionsWithMemories: Object.keys(stats.bySession).length,
      features: {
        hybridSearch: stats.ftsEnabled,
        globalSearch: true,
      },
    };
  }
);

export const consolidateMemoriesTool = defineTool(
  "consolidate_memories",
  "Consolidate important facts from the current conversation into durable memory. Use this before context limits are reached to preserve important information. Automatically extracts and stores preferences, context, and learnings.",
  {
    type: "object",
    properties: {
      reason: {
        type: "string",
        enum: ["approaching_limit", "manual", "session_end"],
        description: "Why memories are being consolidated. Default: 'manual'.",
      },
    },
  },
  async (args, context) => {
    const reason =
      (args.reason as "approaching_limit" | "manual" | "session_end") ??
      "manual";

    // Map reason to flush reason
    const flushReason = reason === "approaching_limit" ? "soft" : "manual";

    const result = await flushMemories(context, flushReason);

    if (result.stored === 0) {
      return {
        success: true,
        stored: 0,
        message: "No new important facts found to consolidate.",
      };
    }

    return {
      success: true,
      stored: result.stored,
      facts: result.facts,
      message: `Consolidated ${result.stored} important ${result.stored === 1 ? "fact" : "facts"} into durable memory.`,
    };
  }
);

export const checkMemoryStatusTool = defineTool(
  "check_memory_status",
  "Check if memory consolidation is needed based on conversation length and token usage.",
  {
    type: "object",
    properties: {},
  },
  async (_args, context) => {
    const estimatedTokens = estimateHistoryTokens(context.history);
    const flushStatus = shouldFlush(context.sessionId, estimatedTokens);

    return {
      success: true,
      estimatedTokens,
      historyLength: context.history.length,
      flushRecommended: flushStatus !== "none",
      flushUrgency: flushStatus,
      message:
        flushStatus === "hard"
          ? "Context limit approaching. Memory consolidation strongly recommended."
          : flushStatus === "soft"
            ? "Consider consolidating memories soon."
            : "Memory status healthy.",
    };
  }
);

export const memoryTools = [
  rememberTool,
  recallTool,
  forgetTool,
  memoryStatsTool,
  consolidateMemoriesTool,
  checkMemoryStatusTool,
];
