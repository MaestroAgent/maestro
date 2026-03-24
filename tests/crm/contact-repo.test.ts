import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initCrmSchema } from "../../src/crm/schema.js";
import { ContactRepo } from "../../src/crm/contact-repo.js";
import { CompanyRepo } from "../../src/crm/company-repo.js";
import type { Contact } from "../../src/crm/contact-repo.js";

describe("ContactRepo", () => {
  let db: Database.Database;
  let repo: ContactRepo;
  let companyRepo: CompanyRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    initCrmSchema(db);
    repo = new ContactRepo(db);
    companyRepo = new CompanyRepo(db);
  });

  describe("createContact + getContact", () => {
    it("creates and retrieves a contact with all fields", () => {
      const contact = repo.createContact({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "+1-555-0100",
        title: "CTO",
        source: "website",
        metadata: { leadScore: 85 },
      });

      expect(contact.firstName).toBe("Jane");
      expect(contact.lastName).toBe("Doe");
      expect(contact.email).toBe("jane@example.com");
      expect(contact.phone).toBe("+1-555-0100");
      expect(contact.title).toBe("CTO");
      expect(contact.source).toBe("website");
      expect(contact.metadata).toEqual({ leadScore: 85 });
      expect(contact.companyId).toBeNull();
      expect(contact.id).toBeTruthy();
      expect(contact.createdAt).toBeTruthy();
      expect(contact.updatedAt).toBeTruthy();

      const fetched = repo.getContact(contact.id);
      expect(fetched).toEqual(contact);
    });

    it("creates a contact with only required fields", () => {
      const contact = repo.createContact({
        firstName: "John",
        lastName: "Smith",
      });

      expect(contact.firstName).toBe("John");
      expect(contact.lastName).toBe("Smith");
      expect(contact.email).toBeNull();
      expect(contact.phone).toBeNull();
      expect(contact.title).toBeNull();
      expect(contact.source).toBeNull();
      expect(contact.metadata).toBeUndefined();
      expect(contact.companyId).toBeNull();
    });
  });

  describe("getContact", () => {
    it("returns null for non-existent id", () => {
      expect(repo.getContact("non-existent")).toBeNull();
    });
  });

  describe("company association", () => {
    it("associates a contact with a company", () => {
      const company = companyRepo.createCompany({ name: "Acme Corp" });
      const contact = repo.createContact({
        firstName: "Jane",
        lastName: "Doe",
        companyId: company.id,
      });

      expect(contact.companyId).toBe(company.id);
    });
  });

  describe("searchContacts", () => {
    let contactA: Contact;
    let contactB: Contact;
    let contactC: Contact;

    beforeEach(() => {
      contactA = repo.createContact({
        firstName: "Alice",
        lastName: "Anderson",
        email: "alice@alpha.com",
        title: "CEO",
      });
      contactB = repo.createContact({
        firstName: "Bob",
        lastName: "Baker",
        email: "bob@beta.io",
        title: "Engineer",
      });
      contactC = repo.createContact({
        firstName: "Carol",
        lastName: "Clark",
        email: "carol@gamma.com",
        title: "Designer",
      });
    });

    it("returns all contacts when no filters are provided", () => {
      const result = repo.searchContacts({});

      expect(result.total).toBe(3);
      expect(result.contacts).toHaveLength(3);
    });

    it("filters by first name query", () => {
      const result = repo.searchContacts({ query: "Alice" });

      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe("Alice");
    });

    it("filters by last name query", () => {
      const result = repo.searchContacts({ query: "Baker" });

      expect(result.total).toBe(1);
      expect(result.contacts[0].lastName).toBe("Baker");
    });

    it("filters by email query", () => {
      const result = repo.searchContacts({ query: "gamma.com" });

      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe("Carol");
    });

    it("filters by title query", () => {
      const result = repo.searchContacts({ query: "Engineer" });

      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe("Bob");
    });

    it("filters by company id", () => {
      const company = companyRepo.createCompany({ name: "Acme Corp" });
      const companyContact = repo.createContact({
        firstName: "Dave",
        lastName: "Davis",
        companyId: company.id,
      });

      const result = repo.searchContacts({ companyId: company.id });

      expect(result.total).toBe(1);
      expect(result.contacts[0].id).toBe(companyContact.id);
    });

    it("combines query and company filters", () => {
      const company = companyRepo.createCompany({ name: "Acme Corp" });
      repo.createContact({
        firstName: "Dave",
        lastName: "Davis",
        companyId: company.id,
      });
      repo.createContact({
        firstName: "Eve",
        lastName: "Davis",
        companyId: company.id,
      });

      const result = repo.searchContacts({
        query: "Dave",
        companyId: company.id,
      });

      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe("Dave");
    });

    it("respects limit parameter", () => {
      const result = repo.searchContacts({ limit: 2 });

      expect(result.total).toBe(3);
      expect(result.contacts).toHaveLength(2);
    });

    it("respects offset parameter", () => {
      const result = repo.searchContacts({ limit: 2, offset: 2 });

      expect(result.total).toBe(3);
      expect(result.contacts).toHaveLength(1);
    });
  });

  describe("updateContact", () => {
    it("updates only provided fields", () => {
      const contact = repo.createContact({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        title: "CTO",
      });

      const updated = repo.updateContact(contact.id, {
        firstName: "Janet",
        title: "CEO",
      });

      expect(updated!.firstName).toBe("Janet");
      expect(updated!.lastName).toBe("Doe");
      expect(updated!.email).toBe("jane@example.com");
      expect(updated!.title).toBe("CEO");
    });

    it("updates company association", () => {
      const contact = repo.createContact({
        firstName: "Jane",
        lastName: "Doe",
      });
      const company = companyRepo.createCompany({ name: "Acme Corp" });

      const updated = repo.updateContact(contact.id, {
        companyId: company.id,
      });

      expect(updated!.companyId).toBe(company.id);
    });

    it("updates metadata", () => {
      const contact = repo.createContact({
        firstName: "Jane",
        lastName: "Doe",
      });

      const updated = repo.updateContact(contact.id, {
        metadata: { key: "value" },
      });

      expect(updated!.metadata).toEqual({ key: "value" });
    });

    it("returns null for non-existent id", () => {
      expect(
        repo.updateContact("non-existent", { firstName: "X" }),
      ).toBeNull();
    });
  });

  describe("deleteContact", () => {
    it("deletes an existing contact", () => {
      const contact = repo.createContact({
        firstName: "Jane",
        lastName: "Doe",
      });

      expect(repo.deleteContact(contact.id)).toBe(true);
      expect(repo.getContact(contact.id)).toBeNull();
    });

    it("returns false for non-existent id", () => {
      expect(repo.deleteContact("non-existent")).toBe(false);
    });
  });
});
