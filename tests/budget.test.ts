import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MaestroDatabase } from "../src/core/database.js";
import { BudgetGuard } from "../src/observability/budget.js";

describe("BudgetGuard", () => {
  let database: MaestroDatabase;
  let guard: BudgetGuard;

  beforeEach(() => {
    database = new MaestroDatabase(":memory:");
    guard = new BudgetGuard(database.db, { dailyLimitUsd: 10 });
  });

  afterEach(() => {
    database.close();
  });

  it("initializes schema on the shared connection", () => {
    const tables = database.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('daily_spending', 'budget_config') ORDER BY name",
      )
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual([
      "budget_config",
      "daily_spending",
    ]);
  });

  it("returns zero spending when no requests recorded", () => {
    const status = guard.getStatus();
    expect(status.dailySpent).toBe(0);
    expect(status.remaining).toBe(10);
    expect(status.isExceeded).toBe(false);
  });

  it("records spending and reflects it in status", () => {
    guard.recordSpending({ inputTokens: 1000, outputTokens: 500 }, "claude-sonnet-4-20250514");
    const status = guard.getStatus();
    expect(status.dailySpent).toBeGreaterThan(0);
  });

  it("blocks requests when budget is exceeded", () => {
    guard.setDailyLimit(0.0001);
    guard.recordSpending({ inputTokens: 100000, outputTokens: 50000 }, "claude-sonnet-4-20250514");
    const result = guard.checkBudget();
    expect(result.allowed).toBe(false);
    expect(result.message).toContain("budget limit");
  });

  it("allows requests when within budget", () => {
    const result = guard.checkBudget();
    expect(result.allowed).toBe(true);
  });
});
