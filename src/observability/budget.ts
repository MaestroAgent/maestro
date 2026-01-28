import Database from "better-sqlite3";
import { calculateCost } from "./cost.js";
import { TokenUsage } from "./types.js";

export interface BudgetConfig {
  dailyLimitUsd: number;
  dbPath: string;
}

export interface BudgetStatus {
  dailySpent: number;
  dailyLimit: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
  date: string;
}

/**
 * Budget guard that tracks daily spending and enforces limits
 */
export class BudgetGuard {
  private db: Database.Database;
  private dailyLimitUsd: number;
  private overrideUntil: Date | null = null;

  constructor(config: BudgetConfig) {
    this.dailyLimitUsd = config.dailyLimitUsd;
    this.db = new Database(config.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_spending (
        date TEXT PRIMARY KEY,
        total_cost_usd REAL NOT NULL DEFAULT 0,
        total_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_output_tokens INTEGER NOT NULL DEFAULT 0,
        request_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS budget_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private getTodayDate(): string {
    return new Date().toISOString().split("T")[0];
  }

  /**
   * Record spending from a request
   */
  recordSpending(usage: TokenUsage, model: string): void {
    const today = this.getTodayDate();
    const now = new Date().toISOString();
    const cost = calculateCost(usage, model);

    // Upsert daily spending
    this.db
      .prepare(
        `
      INSERT INTO daily_spending (date, total_cost_usd, total_input_tokens, total_output_tokens, request_count, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(date) DO UPDATE SET
        total_cost_usd = total_cost_usd + excluded.total_cost_usd,
        total_input_tokens = total_input_tokens + excluded.total_input_tokens,
        total_output_tokens = total_output_tokens + excluded.total_output_tokens,
        request_count = request_count + 1,
        updated_at = excluded.updated_at
    `
      )
      .run(today, cost.totalCost, usage.inputTokens, usage.outputTokens, now);
  }

  /**
   * Get current budget status
   */
  getStatus(): BudgetStatus {
    const today = this.getTodayDate();

    const row = this.db
      .prepare(
        `
      SELECT total_cost_usd FROM daily_spending WHERE date = ?
    `
      )
      .get(today) as { total_cost_usd: number } | undefined;

    const dailySpent = row?.total_cost_usd ?? 0;
    const remaining = Math.max(0, this.dailyLimitUsd - dailySpent);
    const percentUsed =
      this.dailyLimitUsd > 0 ? (dailySpent / this.dailyLimitUsd) * 100 : 0;

    return {
      dailySpent: Math.round(dailySpent * 1000000) / 1000000,
      dailyLimit: this.dailyLimitUsd,
      remaining: Math.round(remaining * 1000000) / 1000000,
      percentUsed: Math.round(percentUsed * 100) / 100,
      isExceeded: dailySpent >= this.dailyLimitUsd,
      date: today,
    };
  }

  /**
   * Check if request should be allowed
   * Returns { allowed: boolean, message?: string }
   */
  checkBudget(): { allowed: boolean; message?: string; status: BudgetStatus } {
    const status = this.getStatus();

    // Check if user has overridden
    if (this.overrideUntil && new Date() < this.overrideUntil) {
      return { allowed: true, status };
    }

    if (status.isExceeded) {
      return {
        allowed: false,
        message:
          `Daily budget limit of $${status.dailyLimit.toFixed(2)} has been reached. ` +
          `Today's spending: $${status.dailySpent.toFixed(4)}. ` +
          `Reply with "/budget override" to continue for the next hour, or wait until tomorrow.`,
        status,
      };
    }

    // Warn at 80%
    if (status.percentUsed >= 80 && status.percentUsed < 100) {
      return {
        allowed: true,
        message: `Warning: ${status.percentUsed.toFixed(1)}% of daily budget used ($${status.dailySpent.toFixed(4)} of $${status.dailyLimit.toFixed(2)})`,
        status,
      };
    }

    return { allowed: true, status };
  }

  /**
   * Override budget limit for specified duration
   */
  override(durationMinutes: number = 60): void {
    this.overrideUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  }

  /**
   * Clear override
   */
  clearOverride(): void {
    this.overrideUntil = null;
  }

  /**
   * Update daily limit
   */
  setDailyLimit(limitUsd: number): void {
    this.dailyLimitUsd = limitUsd;
  }

  /**
   * Get spending history
   */
  getHistory(days: number = 7): Array<{
    date: string;
    totalCost: number;
    requestCount: number;
  }> {
    const rows = this.db
      .prepare(
        `
      SELECT date, total_cost_usd, request_count
      FROM daily_spending
      ORDER BY date DESC
      LIMIT ?
    `
      )
      .all(days) as Array<{
      date: string;
      total_cost_usd: number;
      request_count: number;
    }>;

    return rows.map((r) => ({
      date: r.date,
      totalCost: r.total_cost_usd,
      requestCount: r.request_count,
    }));
  }

  /**
   * Format status for display
   */
  formatStatus(): string {
    const status = this.getStatus();
    const history = this.getHistory(7);

    let output = `\n--- Budget Status ---\n`;
    output += `Today (${status.date}):\n`;
    output += `  Spent: $${status.dailySpent.toFixed(4)} / $${status.dailyLimit.toFixed(2)}\n`;
    output += `  Remaining: $${status.remaining.toFixed(4)} (${(100 - status.percentUsed).toFixed(1)}%)\n`;

    if (status.isExceeded) {
      output += `  Status: LIMIT EXCEEDED\n`;
    } else if (status.percentUsed >= 80) {
      output += `  Status: Warning - approaching limit\n`;
    } else {
      output += `  Status: OK\n`;
    }

    if (history.length > 1) {
      output += `\nRecent History:\n`;
      for (const day of history.slice(0, 7)) {
        output += `  ${day.date}: $${day.totalCost.toFixed(4)} (${day.requestCount} requests)\n`;
      }
    }

    return output;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Global budget guard instance
let budgetGuard: BudgetGuard | null = null;

export function initBudgetGuard(config: BudgetConfig): BudgetGuard {
  if (budgetGuard) {
    budgetGuard.close();
  }
  budgetGuard = new BudgetGuard(config);
  return budgetGuard;
}

export function getBudgetGuard(): BudgetGuard | null {
  return budgetGuard;
}
