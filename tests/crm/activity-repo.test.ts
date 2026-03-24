import { describe, it, expect, beforeEach } from "vitest";
import { MaestroDatabase } from "../../src/core/database.js";
import { initCrmSchema } from "../../src/crm/schema.js";
import { ActivityRepo } from "../../src/crm/activity-repo.js";
import { ContactRepo } from "../../src/crm/contact-repo.js";
import { CompanyRepo } from "../../src/crm/company-repo.js";

describe("ActivityRepo", () => {
  let database: MaestroDatabase;
  let repo: ActivityRepo;
  let contactRepo: ContactRepo;
  let companyRepo: CompanyRepo;

  beforeEach(() => {
    database = new MaestroDatabase(":memory:");
    initCrmSchema(database.db);
    repo = new ActivityRepo(database.db);
    contactRepo = new ContactRepo(database.db);
    companyRepo = new CompanyRepo(database.db);
  });

  describe("logActivity + getActivity", () => {
    it("logs and retrieves an activity with all fields", () => {
      const contact = contactRepo.createContact({
        firstName: "Jane",
        lastName: "Doe",
      });
      const company = companyRepo.createCompany({ name: "Acme Corp" });

      const activity = repo.logActivity({
        type: "call",
        subject: "Follow-up call",
        description: "Discussed Q2 plans",
        contactId: contact.id,
        companyId: company.id,
        dueDate: "2026-04-01",
        createdBy: "agent-1",
        metadata: { duration: 30 },
      });

      expect(activity.type).toBe("call");
      expect(activity.subject).toBe("Follow-up call");
      expect(activity.description).toBe("Discussed Q2 plans");
      expect(activity.contactId).toBe(contact.id);
      expect(activity.companyId).toBe(company.id);
      expect(activity.dealId).toBeNull();
      expect(activity.dueDate).toBe("2026-04-01");
      expect(activity.completedAt).toBeNull();
      expect(activity.createdBy).toBe("agent-1");
      expect(activity.metadata).toEqual({ duration: 30 });
      expect(activity.id).toBeTruthy();
      expect(activity.createdAt).toBeTruthy();

      const fetched = repo.getActivity(activity.id);
      expect(fetched).toEqual(activity);
    });

    it("logs an activity with only required fields", () => {
      const activity = repo.logActivity({ type: "note" });

      expect(activity.type).toBe("note");
      expect(activity.subject).toBeNull();
      expect(activity.description).toBeNull();
      expect(activity.contactId).toBeNull();
      expect(activity.companyId).toBeNull();
      expect(activity.dealId).toBeNull();
      expect(activity.dueDate).toBeNull();
      expect(activity.completedAt).toBeNull();
      expect(activity.createdBy).toBeNull();
      expect(activity.metadata).toBeUndefined();
    });
  });

  describe("getActivity", () => {
    it("returns null for non-existent id", () => {
      expect(repo.getActivity("non-existent")).toBeNull();
    });
  });

  describe("listActivities", () => {
    beforeEach(() => {
      const contact = contactRepo.createContact({
        firstName: "Jane",
        lastName: "Doe",
      });
      const company = companyRepo.createCompany({ name: "Acme Corp" });

      repo.logActivity({
        type: "call",
        subject: "Call 1",
        contactId: contact.id,
        companyId: company.id,
      });
      repo.logActivity({
        type: "email",
        subject: "Email 1",
        contactId: contact.id,
      });
      repo.logActivity({
        type: "call",
        subject: "Call 2",
        companyId: company.id,
      });
    });

    it("returns all activities when no filters are provided", () => {
      const result = repo.listActivities({});

      expect(result.total).toBe(3);
      expect(result.activities).toHaveLength(3);
    });

    it("filters by contact id", () => {
      const contacts = contactRepo.searchContacts({});
      const contactId = contacts.contacts[0].id;

      const result = repo.listActivities({ contactId });

      expect(result.total).toBe(2);
      expect(
        result.activities.every((a) => a.contactId === contactId),
      ).toBe(true);
    });

    it("filters by company id", () => {
      const companies = companyRepo.searchCompanies();
      const companyId = companies.companies[0].id;

      const result = repo.listActivities({ companyId });

      expect(result.total).toBe(2);
      expect(
        result.activities.every((a) => a.companyId === companyId),
      ).toBe(true);
    });

    it("filters by type", () => {
      const result = repo.listActivities({ type: "call" });

      expect(result.total).toBe(2);
      expect(result.activities.every((a) => a.type === "call")).toBe(true);
    });

    it("filters by deal id", () => {
      // Create a deal to associate with an activity
      const stages = database.db
        .prepare("SELECT id FROM crm_pipeline_stages LIMIT 1")
        .get() as { id: string };

      const dealId = "test-deal-id";
      database.db.prepare(
        `INSERT INTO crm_deals (id, title, stage_id, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(dealId, "Test Deal", stages.id, "USD", new Date().toISOString(), new Date().toISOString());

      repo.logActivity({
        type: "note",
        subject: "Deal note",
        dealId,
      });

      const result = repo.listActivities({ dealId });

      expect(result.total).toBe(1);
      expect(result.activities[0].dealId).toBe(dealId);
    });

    it("respects limit parameter", () => {
      const result = repo.listActivities({ limit: 2 });

      expect(result.total).toBe(3);
      expect(result.activities).toHaveLength(2);
    });

    it("respects offset parameter", () => {
      const result = repo.listActivities({ limit: 2, offset: 2 });

      expect(result.total).toBe(3);
      expect(result.activities).toHaveLength(1);
    });
  });

  describe("completeActivity", () => {
    it("sets completed_at timestamp", () => {
      const activity = repo.logActivity({
        type: "task",
        subject: "Follow up",
      });

      expect(activity.completedAt).toBeNull();

      const completed = repo.completeActivity(activity.id);

      expect(completed!.completedAt).toBeTruthy();
      expect(completed!.type).toBe("task");
      expect(completed!.subject).toBe("Follow up");
    });

    it("returns null for non-existent id", () => {
      expect(repo.completeActivity("non-existent")).toBeNull();
    });
  });
});
