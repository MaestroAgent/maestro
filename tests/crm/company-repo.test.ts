import { describe, it, expect, beforeEach } from "vitest";
import { MaestroDatabase } from "../../src/core/database.js";
import { initCrmSchema } from "../../src/crm/schema.js";
import { CompanyRepo } from "../../src/crm/company-repo.js";
import type { Company } from "../../src/crm/company-repo.js";

describe("CompanyRepo", () => {
  let database: MaestroDatabase;
  let repo: CompanyRepo;

  beforeEach(() => {
    database = new MaestroDatabase(":memory:");
    initCrmSchema(database.db);
    repo = new CompanyRepo(database.db);
  });

  describe("createCompany + getCompany", () => {
    it("creates and retrieves a company with all fields", () => {
      const company = repo.createCompany({
        name: "Acme Corp",
        domain: "acme.com",
        industry: "Technology",
        size: "100-500",
        metadata: { source: "manual" },
      });

      expect(company.name).toBe("Acme Corp");
      expect(company.domain).toBe("acme.com");
      expect(company.industry).toBe("Technology");
      expect(company.size).toBe("100-500");
      expect(company.metadata).toEqual({ source: "manual" });
      expect(company.id).toBeTruthy();
      expect(company.createdAt).toBeTruthy();
      expect(company.updatedAt).toBeTruthy();

      const fetched = repo.getCompany(company.id);
      expect(fetched).toEqual(company);
    });

    it("creates a company with only required fields", () => {
      const company = repo.createCompany({ name: "Minimal Co" });

      expect(company.name).toBe("Minimal Co");
      expect(company.domain).toBeNull();
      expect(company.industry).toBeNull();
      expect(company.size).toBeNull();
      expect(company.metadata).toBeUndefined();
    });
  });

  describe("getCompany", () => {
    it("returns null for non-existent id", () => {
      expect(repo.getCompany("non-existent")).toBeNull();
    });
  });

  describe("searchCompanies", () => {
    let companyA: Company;
    let companyB: Company;
    let companyC: Company;

    beforeEach(() => {
      companyA = repo.createCompany({
        name: "Alpha Inc",
        domain: "alpha.com",
      });
      companyB = repo.createCompany({
        name: "Beta Corp",
        domain: "beta.io",
      });
      companyC = repo.createCompany({
        name: "Gamma LLC",
        domain: "gamma.com",
      });
    });

    it("returns all companies when no query is provided", () => {
      const result = repo.searchCompanies();

      expect(result.total).toBe(3);
      expect(result.companies).toHaveLength(3);
    });

    it("filters by name query", () => {
      const result = repo.searchCompanies("Alpha");

      expect(result.total).toBe(1);
      expect(result.companies[0].name).toBe("Alpha Inc");
    });

    it("filters by domain query", () => {
      const result = repo.searchCompanies("gamma.com");

      expect(result.total).toBe(1);
      expect(result.companies[0].name).toBe("Gamma LLC");
    });

    it("respects limit parameter", () => {
      const result = repo.searchCompanies(undefined, 2);

      expect(result.total).toBe(3);
      expect(result.companies).toHaveLength(2);
    });

    it("respects offset parameter", () => {
      const result = repo.searchCompanies(undefined, 2, 2);

      expect(result.total).toBe(3);
      expect(result.companies).toHaveLength(1);
    });
  });

  describe("updateCompany", () => {
    it("updates only provided fields", () => {
      const company = repo.createCompany({
        name: "Original",
        domain: "original.com",
        industry: "Tech",
      });

      const updated = repo.updateCompany(company.id, {
        name: "Updated",
        industry: "Finance",
      });

      expect(updated!.name).toBe("Updated");
      expect(updated!.domain).toBe("original.com");
      expect(updated!.industry).toBe("Finance");
      expect(updated!.updatedAt).toBeTruthy();
    });

    it("updates metadata", () => {
      const company = repo.createCompany({ name: "Test" });

      const updated = repo.updateCompany(company.id, {
        metadata: { key: "value" },
      });

      expect(updated!.metadata).toEqual({ key: "value" });
    });

    it("returns null for non-existent id", () => {
      expect(repo.updateCompany("non-existent", { name: "X" })).toBeNull();
    });
  });

  describe("deleteCompany", () => {
    it("deletes an existing company", () => {
      const company = repo.createCompany({ name: "ToDelete" });

      expect(repo.deleteCompany(company.id)).toBe(true);
      expect(repo.getCompany(company.id)).toBeNull();
    });

    it("returns false for non-existent id", () => {
      expect(repo.deleteCompany("non-existent")).toBe(false);
    });
  });
});
