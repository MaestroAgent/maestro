import { Message, AgentContext } from "../core/types.js";

/**
 * Configuration for memory flush thresholds
 */
export interface FlushConfig {
  /** Estimated context window size in tokens (default: 200000 for Claude) */
  contextWindowTokens: number;
  /** Soft threshold - start considering flush (default: 0.8 = 80% of window) */
  softThresholdRatio: number;
  /** Hard threshold - force flush (default: 0.95 = 95% of window) */
  hardThresholdRatio: number;
  /** Minimum tokens used before flush is considered (default: 50000) */
  minTokensForFlush: number;
}

const DEFAULT_FLUSH_CONFIG: FlushConfig = {
  contextWindowTokens: 200000,
  softThresholdRatio: 0.8,
  hardThresholdRatio: 0.95,
  minTokensForFlush: 50000,
};

/**
 * Session flush state tracking
 */
interface SessionFlushState {
  lastFlushAtTokens: number;
  flushCount: number;
  lastFlushAt: Date;
}

// Track flush state per session
const sessionFlushStates = new Map<string, SessionFlushState>();

/**
 * Estimates the number of tokens in a message
 * Uses a simple heuristic: ~4 characters per token on average
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Estimates total tokens used in conversation history
 */
export function estimateHistoryTokens(history: Message[]): number {
  return history.reduce((total, msg) => total + estimateTokens(msg.content), 0);
}

/**
 * Checks if a memory flush should be triggered
 *
 * Returns:
 * - 'none': No flush needed
 * - 'soft': Approaching limit, flush recommended
 * - 'hard': At limit, flush required
 */
export function shouldFlush(
  sessionId: string,
  totalTokens: number,
  config: Partial<FlushConfig> = {}
): "none" | "soft" | "hard" {
  const cfg = { ...DEFAULT_FLUSH_CONFIG, ...config };

  // Don't flush if we haven't accumulated enough tokens
  if (totalTokens < cfg.minTokensForFlush) {
    return "none";
  }

  // Check if we've already flushed recently at this token level
  const state = sessionFlushStates.get(sessionId);
  if (
    state &&
    totalTokens - state.lastFlushAtTokens < cfg.minTokensForFlush / 2
  ) {
    return "none";
  }

  const softThreshold = cfg.contextWindowTokens * cfg.softThresholdRatio;
  const hardThreshold = cfg.contextWindowTokens * cfg.hardThresholdRatio;

  if (totalTokens >= hardThreshold) {
    return "hard";
  }

  if (totalTokens >= softThreshold) {
    return "soft";
  }

  return "none";
}

/**
 * Extracts important facts from conversation history
 * Uses heuristics to identify:
 * - User preferences and requests
 * - Key decisions made
 * - Important context established
 */
export function extractImportantFacts(history: Message[]): string[] {
  const facts: string[] = [];

  for (const msg of history) {
    // Look for explicit statements of preference/fact
    const content = msg.content.toLowerCase();

    // User preferences
    if (msg.role === "user") {
      // Preference indicators
      if (
        content.includes("i prefer") ||
        content.includes("i like") ||
        content.includes("i want")
      ) {
        facts.push(`User preference: ${msg.content.slice(0, 200)}`);
      }

      // Important context
      if (content.includes("important") || content.includes("remember")) {
        facts.push(`Important context: ${msg.content.slice(0, 200)}`);
      }

      // Names and identifiers
      if (content.includes("my name is") || content.includes("call me")) {
        facts.push(`User identity: ${msg.content.slice(0, 100)}`);
      }

      // Project/work context
      if (content.includes("working on") || content.includes("project")) {
        facts.push(`Project context: ${msg.content.slice(0, 200)}`);
      }
    }

    // Assistant learnings
    if (msg.role === "assistant") {
      // Decisions made
      if (
        content.includes("i'll") ||
        content.includes("i will") ||
        content.includes("let me")
      ) {
        // Only capture if it seems like a significant action
        if (msg.content.length > 100) {
          facts.push(`Decision made: ${msg.content.slice(0, 200)}`);
        }
      }
    }
  }

  // Deduplicate similar facts
  return [...new Set(facts)];
}

/**
 * Performs a memory flush - consolidates conversation history into durable memories
 *
 * @param context - The agent context with history to consolidate
 * @param reason - Why the flush is being triggered ('soft', 'hard', 'manual')
 * @returns Number of memories stored
 */
export async function flushMemories(
  context: AgentContext,
  reason: "soft" | "hard" | "manual" = "manual"
): Promise<{ stored: number; facts: string[] }> {
  const vectorStore = context.services.vectorStore;
  if (!vectorStore) {
    return { stored: 0, facts: [] };
  }

  // Extract important facts from history
  const facts = extractImportantFacts(context.history);

  if (facts.length === 0) {
    return { stored: 0, facts: [] };
  }

  // Store each fact as a memory
  let stored = 0;
  for (const fact of facts) {
    // Skip if duplicate already exists
    const isDuplicate = await vectorStore.deduplicate(fact, 0.85);
    if (isDuplicate) {
      continue;
    }

    // Determine memory type based on content
    let type: "fact" | "preference" | "context" | "learning" = "context";
    const lowerFact = fact.toLowerCase();
    if (
      lowerFact.includes("preference") ||
      lowerFact.includes("prefer") ||
      lowerFact.includes("like")
    ) {
      type = "preference";
    } else if (
      lowerFact.includes("decision") ||
      lowerFact.includes("learned")
    ) {
      type = "learning";
    } else if (
      lowerFact.includes("identity") ||
      lowerFact.includes("project")
    ) {
      type = "fact";
    }

    await vectorStore.add(
      fact,
      type,
      context.sessionId,
      0.8, // Slightly lower confidence for auto-extracted facts
      {
        source: "memory_flush",
        reason,
        extractedAt: new Date().toISOString(),
      }
    );
    stored++;
  }

  // Update flush state
  const totalTokens = estimateHistoryTokens(context.history);
  sessionFlushStates.set(context.sessionId, {
    lastFlushAtTokens: totalTokens,
    flushCount:
      (sessionFlushStates.get(context.sessionId)?.flushCount ?? 0) + 1,
    lastFlushAt: new Date(),
  });

  return { stored, facts };
}

/**
 * Gets flush statistics for a session
 */
export function getFlushStats(sessionId: string): SessionFlushState | null {
  return sessionFlushStates.get(sessionId) ?? null;
}

/**
 * Clears flush state for a session (e.g., when session ends)
 */
export function clearFlushState(sessionId: string): void {
  sessionFlushStates.delete(sessionId);
}

/**
 * Prompt for triggering memory consolidation
 * This is used to guide the agent to consolidate memories before compaction
 */
export const MEMORY_FLUSH_PROMPT = `
You are about to reach the context limit. Before continuing, please consolidate important information from this conversation into durable memory:

1. Use the 'remember' tool to store any important facts, preferences, or context that should persist
2. Focus on: user preferences, project context, key decisions, and important learnings
3. Skip information that is already stored or is not important for future reference
4. Be concise - store the essence of the information, not verbatim copies

After storing relevant memories, you can continue with the user's request.
`.trim();
