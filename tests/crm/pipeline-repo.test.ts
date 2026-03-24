import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initCrmSchema } from "../../src/crm/schema.js";
import { PipelineRepo } from "../../src/crm/pipeline-repo.js";
import { randomUUID } from "crypto";

function insertDeal(
  db: Database.Database,
  overrides: {
    stageId: string;
    value?: number;
    expectedCloseDate?: string;
    closedWon?: number | null;
  },
): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO crm_deals (id, title, stage_id, value, currency, expected_close_date, closed_won, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    `Deal ${id.slice(0, 8)}`,
    overrides.stageId,
    overrides.value ?? null,
    "USD",
    overrides.expectedCloseDate ?? null,
    overrides.closedWon ?? null,
    now,
    now,
  );
  return id;
}

describe("PipelineRepo", () => {
  let db: Database.Database;
  let repo: PipelineRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    initCrmSchema(db);
    repo = new PipelineRepo(db);
  });

  describe("getStages", () => {
    it("returns default seeded stages in display order", () => {
      const stages = repo.getStages();

      expect(stages).toHaveLength(6);
      expect(stages.map((s) => s.name)).toEqual([
        "Lead",
        "Qualified",
        "Proposal",
        "Negotiation",
        "Closed Won",
        "Closed Lost",
      ]);
      expect(stages[0].displayOrder).toBe(1);
      expect(stages[5].displayOrder).toBe(6);
      expect(stages[0].id).toBeTruthy();
      expect(stages[0].createdAt).toBeTruthy();
    });
  });

  describe("getStageByName", () => {
    it("returns the matching stage", () => {
      const stage = repo.getStageByName("Proposal");

      expect(stage).not.toBeNull();
      expect(stage!.name).toBe("Proposal");
      expect(stage!.displayOrder).toBe(3);
    });

    it("returns null for non-existent stage name", () => {
      expect(repo.getStageByName("Non-existent")).toBeNull();
    });
  });

  describe("getPipelineSummary", () => {
    it("returns all stages with zero counts when no deals exist", () => {
      const summary = repo.getPipelineSummary();

      expect(summary).toHaveLength(6);
      for (const stage of summary) {
        expect(stage.dealCount).toBe(0);
        expect(stage.totalValue).toBe(0);
        expect(stage.avgValue).toBe(0);
      }
    });

    it("aggregates open deals per stage", () => {
      const stages = repo.getStages();
      const leadId = stages[0].id;
      const qualifiedId = stages[1].id;

      insertDeal(db, { stageId: leadId, value: 1000 });
      insertDeal(db, { stageId: leadId, value: 3000 });
      insertDeal(db, { stageId: qualifiedId, value: 5000 });

      const summary = repo.getPipelineSummary();
      const lead = summary.find((s) => s.stageName === "Lead")!;
      const qualified = summary.find((s) => s.stageName === "Qualified")!;

      expect(lead.dealCount).toBe(2);
      expect(lead.totalValue).toBe(4000);
      expect(lead.avgValue).toBe(2000);

      expect(qualified.dealCount).toBe(1);
      expect(qualified.totalValue).toBe(5000);
      expect(qualified.avgValue).toBe(5000);
    });

    it("excludes closed deals from summary", () => {
      const stages = repo.getStages();
      const leadId = stages[0].id;

      insertDeal(db, { stageId: leadId, value: 1000 });
      insertDeal(db, { stageId: leadId, value: 2000, closedWon: 1 });

      const summary = repo.getPipelineSummary();
      const lead = summary.find((s) => s.stageName === "Lead")!;

      expect(lead.dealCount).toBe(1);
      expect(lead.totalValue).toBe(1000);
    });
  });

  describe("getDealForecast", () => {
    it("returns empty forecast when no deals match the period", () => {
      const forecast = repo.getDealForecast("this_month");

      expect(forecast.period).toBe("this_month");
      expect(forecast.startDate).toBeTruthy();
      expect(forecast.endDate).toBeTruthy();
      expect(forecast.stages).toHaveLength(0);
      expect(forecast.totalDeals).toBe(0);
      expect(forecast.totalValue).toBe(0);
    });

    it("includes deals with expected_close_date in this_month", () => {
      const stages = repo.getStages();
      const leadId = stages[0].id;

      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;

      insertDeal(db, {
        stageId: leadId,
        value: 5000,
        expectedCloseDate: thisMonth,
      });

      const forecast = repo.getDealForecast("this_month");

      expect(forecast.totalDeals).toBe(1);
      expect(forecast.totalValue).toBe(5000);
      expect(forecast.stages).toHaveLength(1);
      expect(forecast.stages[0].stageName).toBe("Lead");
    });

    it("excludes closed deals from forecast", () => {
      const stages = repo.getStages();
      const leadId = stages[0].id;

      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;

      insertDeal(db, {
        stageId: leadId,
        value: 5000,
        expectedCloseDate: thisMonth,
      });
      insertDeal(db, {
        stageId: leadId,
        value: 3000,
        expectedCloseDate: thisMonth,
        closedWon: 1,
      });

      const forecast = repo.getDealForecast("this_month");

      expect(forecast.totalDeals).toBe(1);
      expect(forecast.totalValue).toBe(5000);
    });

    it("forecasts next_month correctly", () => {
      const stages = repo.getStages();
      const qualifiedId = stages[1].id;

      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      const nextMonthStr = nextMonth.toISOString().split("T")[0];

      insertDeal(db, {
        stageId: qualifiedId,
        value: 10000,
        expectedCloseDate: nextMonthStr,
      });

      const forecast = repo.getDealForecast("next_month");

      expect(forecast.period).toBe("next_month");
      expect(forecast.totalDeals).toBe(1);
      expect(forecast.totalValue).toBe(10000);
    });

    it("forecasts this_quarter correctly", () => {
      const stages = repo.getStages();
      const proposalId = stages[2].id;

      const now = new Date();
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      const midQuarter = new Date(now.getFullYear(), quarterStart + 1, 15);
      const midQuarterStr = midQuarter.toISOString().split("T")[0];

      insertDeal(db, {
        stageId: proposalId,
        value: 20000,
        expectedCloseDate: midQuarterStr,
      });

      const forecast = repo.getDealForecast("this_quarter");

      expect(forecast.period).toBe("this_quarter");
      expect(forecast.totalDeals).toBe(1);
      expect(forecast.totalValue).toBe(20000);
    });

    it("defaults to this_month for unknown period", () => {
      const forecast = repo.getDealForecast("unknown_period");

      const thisMonthForecast = repo.getDealForecast("this_month");
      expect(forecast.startDate).toBe(thisMonthForecast.startDate);
      expect(forecast.endDate).toBe(thisMonthForecast.endDate);
    });
  });
});
