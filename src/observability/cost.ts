import { TokenUsage, CostEstimate, SessionCostSummary } from "./types.js";

/**
 * Model pricing per 1M tokens (in USD)
 * Updated January 2025
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude 3.5 Sonnet
  "claude-3-5-sonnet-20240620": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  // Claude 4 Sonnet (latest)
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  // Claude 3 Opus
  "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
  // Claude 3 Haiku
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  // Default fallback
  default: { input: 3.0, output: 15.0 },
};

function getPricing(model: string): { input: number; output: number } {
  return MODEL_PRICING[model] || MODEL_PRICING.default;
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  usage: TokenUsage,
  model: string
): CostEstimate {
  const pricing = getPricing(model);

  // Convert from per-million to actual cost
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

  return {
    inputCost: Math.round(inputCost * 1_000_000) / 1_000_000, // 6 decimal places
    outputCost: Math.round(outputCost * 1_000_000) / 1_000_000,
    totalCost: Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000,
    currency: "USD",
  };
}

/**
 * Cost tracker for a session
 */
export class CostTracker {
  private sessionId: string;
  private model: string;
  private requests: number = 0;
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;
  private byAgent: Map<
    string,
    { requests: number; inputTokens: number; outputTokens: number }
  > = new Map();

  constructor(sessionId: string, model: string = "claude-sonnet-4-20250514") {
    this.sessionId = sessionId;
    this.model = model;
  }

  /**
   * Record token usage for a request
   */
  record(
    usage: TokenUsage,
    agentName: string = "unknown"
  ): void {
    this.requests++;
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;

    // Track by agent
    const agentStats = this.byAgent.get(agentName) || {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    agentStats.requests++;
    agentStats.inputTokens += usage.inputTokens;
    agentStats.outputTokens += usage.outputTokens;
    this.byAgent.set(agentName, agentStats);
  }

  /**
   * Get current totals
   */
  getTotals(): TokenUsage {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
    };
  }

  /**
   * Get estimated cost
   */
  getEstimatedCost(): CostEstimate {
    return calculateCost(this.getTotals(), this.model);
  }

  /**
   * Get full session summary
   */
  getSummary(): SessionCostSummary {
    const byAgent: SessionCostSummary["byAgent"] = {};

    for (const [name, stats] of this.byAgent) {
      byAgent[name] = {
        ...stats,
        estimatedCost: calculateCost(
          {
            inputTokens: stats.inputTokens,
            outputTokens: stats.outputTokens,
            totalTokens: stats.inputTokens + stats.outputTokens,
          },
          this.model
        ),
      };
    }

    return {
      sessionId: this.sessionId,
      requests: this.requests,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      estimatedCost: this.getEstimatedCost(),
      byAgent,
    };
  }

  /**
   * Format summary for display
   */
  formatSummary(): string {
    const summary = this.getSummary();
    const cost = summary.estimatedCost;

    let output = `\n--- Cost Summary ---\n`;
    output += `Session: ${summary.sessionId.slice(0, 8)}...\n`;
    output += `Requests: ${summary.requests}\n`;
    output += `Tokens: ${summary.totalInputTokens.toLocaleString()} in / ${summary.totalOutputTokens.toLocaleString()} out\n`;
    output += `Estimated Cost: $${cost.totalCost.toFixed(6)}\n`;

    if (Object.keys(summary.byAgent).length > 1) {
      output += `\nBy Agent:\n`;
      for (const [name, stats] of Object.entries(summary.byAgent)) {
        output += `  ${name}: ${stats.requests} req, $${stats.estimatedCost.totalCost.toFixed(6)}\n`;
      }
    }

    return output;
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.requests = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.byAgent.clear();
  }
}

// Global cost trackers by session
const sessionTrackers = new Map<string, CostTracker>();

export function getCostTracker(
  sessionId: string,
  model?: string
): CostTracker {
  let tracker = sessionTrackers.get(sessionId);
  if (!tracker) {
    tracker = new CostTracker(sessionId, model);
    sessionTrackers.set(sessionId, tracker);
  }
  return tracker;
}

export function clearCostTracker(sessionId: string): void {
  sessionTrackers.delete(sessionId);
}
