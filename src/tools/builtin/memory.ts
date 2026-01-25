import { defineTool } from "../registry.js";
import { getVectorStore } from "../../memory/vectors.js";
import { MemoryType } from "../../memory/types.js";

export const rememberTool = defineTool(
  "remember",
  "Store a piece of information in long-term memory for future recall. Use this to remember facts, user preferences, context, or learnings that should persist across conversations.",
  {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The information to remember. Should be a clear, self-contained statement.",
      },
      type: {
        type: "string",
        enum: ["fact", "preference", "context", "learning"],
        description: "The type of memory: 'fact' for factual information, 'preference' for user preferences, 'context' for situational context, 'learning' for insights or lessons learned.",
      },
      confidence: {
        type: "number",
        description: "Confidence level from 0 to 1 (default 1.0). Lower confidence for uncertain information.",
      },
    },
    required: ["content", "type"],
  },
  async (args, context) => {
    const vectorStore = getVectorStore();
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
        suggestion: "Use 'recall' to find existing memories or rephrase the content.",
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
        description: "What to search for in memory. Can be a question or keywords.",
      },
      limit: {
        type: "number",
        description: "Maximum number of memories to retrieve (default 5).",
      },
      type: {
        type: "string",
        enum: ["fact", "preference", "context", "learning"],
        description: "Filter by a single memory type. If not specified, searches all types.",
      },
    },
    required: ["query"],
  },
  async (args, context) => {
    const vectorStore = getVectorStore();
    if (!vectorStore) {
      return { success: false, error: "Memory system not initialized" };
    }

    const query = args.query as string;
    const limit = (args.limit as number) ?? 5;
    const type = args.type as MemoryType | undefined;
    const types = type ? [type] : undefined;

    const results = await vectorStore.search(query, limit, context.sessionId, types);

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
      })),
      message: `Found ${results.length} relevant ${results.length === 1 ? "memory" : "memories"}.`,
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
  async (args) => {
    const vectorStore = getVectorStore();
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
  async () => {
    const vectorStore = getVectorStore();
    if (!vectorStore) {
      return { success: false, error: "Memory system not initialized" };
    }

    const stats = vectorStore.getStats();

    return {
      success: true,
      totalMemories: stats.total,
      byType: stats.byType,
      sessionsWithMemories: Object.keys(stats.bySession).length,
    };
  }
);

export const memoryTools = [rememberTool, recallTool, forgetTool, memoryStatsTool];
