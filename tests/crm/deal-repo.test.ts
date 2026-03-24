import { describe, it, expect, beforeEach } from "vitest";
import { MaestroDatabase } from "../../src/core/database.js";
import { initCrmSchema } from "../../src/crm/schema.js";
import { DealRepo } from "../../src/crm/deal-repo.js";
import { ActivityRepo } from "../../src/crm/activity-repo.js";
import { PipelineRepo } from "../../src/crm/pipeline-repo.js";
import { CompanyRepo } from "../../src/crm/company-repo.js";
import { ContactRepo } from "../../src/crm/contact-repo.js";

describe("DealRepo", () => {
  let database: MaestroDatabase;
  let dealRepo: DealRepo;
  let activityRepo: ActivityRepo;
  let pipelineRepo: PipelineRepo;
  let companyRepo: CompanyRepo;
  let contactRepo: ContactRepo;
  let leadStageId: string;

  beforeEach(() => {
    database = new MaestroDatabase(":memory:");
    initCrmSchema(database.db);
    activityRepo = new ActivityRepo(database.db);
    pipelineRepo = new PipelineRepo(database.db);
    companyRepo = new CompanyRepo(database.db);
    contactRepo = new ContactRepo(database.db);
    dealRepo = new DealRepo(database.db, activityRepo, pipelineRepo);

    const stages = pipelineRepo.getStages();
    leadStageId = stages.find((s) => s.name === "Lead")!.id;
  });

  describe("createDeal + getDeal", () => {
    it("creates and retrieves a deal with all fields", () => {
      const company = companyRepo.createCompany({ name: "Acme Corp" });
      const contact = contactRepo.createContact({
        firstName: "Jane",
        lastName: "Doe",
      });

      const deal = dealRepo.createDeal({
        title: "Enterprise License",
        stageId: leadStageId,
        companyId: company.id,
        contactId: contact.id,
        value: 50000,
        currency: "EUR",
        expectedCloseDate: "2026-06-30",
        metadata: { source: "inbound" },
      });

      expect(deal.title).toBe("Enterprise License");
      expect(deal.stageId).toBe(leadStageId);
      expect(deal.companyId).toBe(company.id);
      expect(deal.contactId).toBe(contact.id);
      expect(deal.value).toBe(50000);
      expect(deal.currency).toBe("EUR");
      expect(deal.expectedCloseDate).toBe("2026-06-30");
      expect(deal.closedAt).toBeNull();
      expect(deal.closedWon).toBeNull();
      expect(deal.lostReason).toBeNull();
      expect(deal.metadata).toEqual({ source: "inbound" });
      expect(deal.id).toBeTruthy();
      expect(deal.createdAt).toBeTruthy();
      expect(deal.updatedAt).toBeTruthy();

      const fetched = dealRepo.getDeal(deal.id);
      expect(fetched).toEqual(deal);
    });

    it("creates a deal with only required fields", () => {
      const deal = dealRepo.createDeal({
        title: "Basic Deal",
        stageId: leadStageId,
      });

      expect(deal.title).toBe("Basic Deal");
      expect(deal.companyId).toBeNull();
      expect(deal.contactId).toBeNull();
      expect(deal.value).toBeNull();
      expect(deal.currency).toBe("USD");
      expect(deal.expectedCloseDate).toBeNull();
      expect(deal.metadata).toBeUndefined();
    });
  });

  describe("getDeal", () => {
    it("returns null for non-existent id", () => {
      expect(dealRepo.getDeal("non-existent")).toBeNull();
    });
  });

  describe("searchDeals", () => {
    let qualifiedStageId: string;
    let companyId: string;
    let contactId: string;

    beforeEach(() => {
      const stages = pipelineRepo.getStages();
      qualifiedStageId = stages.find((s) => s.name === "Qualified")!.id;

      const company = companyRepo.createCompany({ name: "Acme Corp" });
      const contact = contactRepo.createContact({
        firstName: "Jane",
        lastName: "Doe",
      });
      companyId = company.id;
      contactId = contact.id;

      dealRepo.createDeal({
        title: "Alpha Deal",
        stageId: leadStageId,
        companyId: company.id,
        contactId: contact.id,
        value: 10000,
      });
      dealRepo.createDeal({
        title: "Beta Deal",
        stageId: qualifiedStageId,
        companyId: company.id,
        value: 20000,
      });
      dealRepo.createDeal({
        title: "Gamma Deal",
        stageId: leadStageId,
        value: 5000,
      });
    });

    it("returns all deals when no filters are provided", () => {
      const result = dealRepo.searchDeals({});
      expect(result.total).toBe(3);
      expect(result.deals).toHaveLength(3);
    });

    it("filters by query (title match)", () => {
      const result = dealRepo.searchDeals({ query: "Alpha" });
      expect(result.total).toBe(1);
      expect(result.deals[0].title).toBe("Alpha Deal");
    });

    it("filters by stageId", () => {
      const result = dealRepo.searchDeals({ stageId: leadStageId });
      expect(result.total).toBe(2);
      expect(result.deals.every((d) => d.stageId === leadStageId)).toBe(true);
    });

    it("filters by companyId", () => {
      const result = dealRepo.searchDeals({ companyId });
      expect(result.total).toBe(2);
      expect(result.deals.every((d) => d.companyId === companyId)).toBe(true);
    });

    it("filters by contactId", () => {
      const result = dealRepo.searchDeals({ contactId });
      expect(result.total).toBe(1);
      expect(result.deals[0].contactId).toBe(contactId);
    });

    it("respects limit parameter", () => {
      const result = dealRepo.searchDeals({ limit: 2 });
      expect(result.total).toBe(3);
      expect(result.deals).toHaveLength(2);
    });

    it("respects offset parameter", () => {
      const result = dealRepo.searchDeals({ limit: 2, offset: 2 });
      expect(result.total).toBe(3);
      expect(result.deals).toHaveLength(1);
    });
  });

  describe("updateDeal", () => {
    it("updates partial fields", () => {
      const deal = dealRepo.createDeal({
        title: "Original Title",
        stageId: leadStageId,
        value: 10000,
      });

      const updated = dealRepo.updateDeal(deal.id, {
        title: "Updated Title",
        value: 25000,
      });

      expect(updated!.title).toBe("Updated Title");
      expect(updated!.value).toBe(25000);
      expect(updated!.stageId).toBe(leadStageId);
    });

    it("returns null for non-existent id", () => {
      expect(
        dealRepo.updateDeal("non-existent", { title: "X" }),
      ).toBeNull();
    });
  });

  describe("moveDealStage", () => {
    it("updates stage and auto-logs an activity", () => {
      const stages = pipelineRepo.getStages();
      const qualifiedStageId = stages.find((s) => s.name === "Qualified")!.id;

      const deal = dealRepo.createDeal({
        title: "Stage Move Deal",
        stageId: leadStageId,
      });

      const moved = dealRepo.moveDealStage(deal.id, qualifiedStageId);

      expect(moved!.stageId).toBe(qualifiedStageId);

      const activities = activityRepo.listActivities({ dealId: deal.id });
      expect(activities.total).toBe(1);
      expect(activities.activities[0].subject).toBe("Stage changed");
      expect(activities.activities[0].description).toContain("Lead");
      expect(activities.activities[0].description).toContain("Qualified");
      expect(activities.activities[0].createdBy).toBe("system");
    });

    it("returns null for non-existent deal", () => {
      expect(dealRepo.moveDealStage("non-existent", leadStageId)).toBeNull();
    });

    it("returns null for non-existent stage", () => {
      const deal = dealRepo.createDeal({
        title: "Test Deal",
        stageId: leadStageId,
      });
      expect(dealRepo.moveDealStage(deal.id, "bad-stage-id")).toBeNull();
    });
  });

  describe("closeDeal", () => {
    it("closes deal as won with correct stage and activity", () => {
      const deal = dealRepo.createDeal({
        title: "Won Deal",
        stageId: leadStageId,
        value: 30000,
      });

      const closed = dealRepo.closeDeal(deal.id, true);

      expect(closed!.closedWon).toBe(true);
      expect(closed!.closedAt).toBeTruthy();
      expect(closed!.lostReason).toBeNull();

      const closedWonStage = pipelineRepo.getStageByName("Closed Won")!;
      expect(closed!.stageId).toBe(closedWonStage.id);

      const activities = activityRepo.listActivities({ dealId: deal.id });
      expect(activities.total).toBe(1);
      expect(activities.activities[0].subject).toBe("Deal won");
      expect(activities.activities[0].description).toContain("$30000");
    });

    it("closes deal as lost with reason, correct stage, and activity", () => {
      const deal = dealRepo.createDeal({
        title: "Lost Deal",
        stageId: leadStageId,
      });

      const closed = dealRepo.closeDeal(deal.id, false, "Budget constraints");

      expect(closed!.closedWon).toBe(false);
      expect(closed!.closedAt).toBeTruthy();
      expect(closed!.lostReason).toBe("Budget constraints");

      const closedLostStage = pipelineRepo.getStageByName("Closed Lost")!;
      expect(closed!.stageId).toBe(closedLostStage.id);

      const activities = activityRepo.listActivities({ dealId: deal.id });
      expect(activities.total).toBe(1);
      expect(activities.activities[0].subject).toBe("Deal lost");
      expect(activities.activities[0].description).toContain(
        "Budget constraints",
      );
    });

    it("closes deal as lost without reason", () => {
      const deal = dealRepo.createDeal({
        title: "Lost Deal No Reason",
        stageId: leadStageId,
      });

      const closed = dealRepo.closeDeal(deal.id, false);

      expect(closed!.closedWon).toBe(false);
      expect(closed!.lostReason).toBeNull();
    });

    it("returns null for non-existent deal", () => {
      expect(dealRepo.closeDeal("non-existent", true)).toBeNull();
    });
  });

  describe("deleteDeal", () => {
    it("deletes an existing deal", () => {
      const deal = dealRepo.createDeal({
        title: "To Delete",
        stageId: leadStageId,
      });

      expect(dealRepo.deleteDeal(deal.id)).toBe(true);
      expect(dealRepo.getDeal(deal.id)).toBeNull();
    });

    it("returns false for non-existent deal", () => {
      expect(dealRepo.deleteDeal("non-existent")).toBe(false);
    });
  });

  describe("closedWon filter in searchDeals", () => {
    it("filters by closedWon status", () => {
      dealRepo.createDeal({
        title: "Open Deal",
        stageId: leadStageId,
      });

      const wonDeal = dealRepo.createDeal({
        title: "Won Deal",
        stageId: leadStageId,
      });
      dealRepo.closeDeal(wonDeal.id, true);

      const lostDeal = dealRepo.createDeal({
        title: "Lost Deal",
        stageId: leadStageId,
      });
      dealRepo.closeDeal(lostDeal.id, false);

      const wonResults = dealRepo.searchDeals({ closedWon: true });
      expect(wonResults.total).toBe(1);
      expect(wonResults.deals[0].title).toBe("Won Deal");

      const lostResults = dealRepo.searchDeals({ closedWon: false });
      expect(lostResults.total).toBe(1);
      expect(lostResults.deals[0].title).toBe("Lost Deal");
    });
  });
});
