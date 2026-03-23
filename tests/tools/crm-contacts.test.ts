import { describe, it, expect } from "vitest";
import { crmContactsTool } from "../../src/tools/crm/contacts.js";
import { AgentContext } from "../../src/core/types.js";

// --- Mock helpers ---

function createMockCrmStore() {
  return {
    searchContacts: ({ query, companyId, limit }: {
      query?: string;
      companyId?: string;
      limit?: number;
    }) => ({
      contacts: [
        {
          id: "c1",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          phone: null,
          title: "CTO",
          companyId: null,
          source: null,
          metadata: undefined,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      total: 1,
    }),
    getContact: (id: string) => {
      if (id === "c1") {
        return {
          id: "c1",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          phone: null,
          title: "CTO",
          companyId: null,
          source: null,
          metadata: undefined,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        };
      }
      return null;
    },
    createContact: (data: Record<string, unknown>) => ({
      id: "c-new",
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: null,
      title: null,
      companyId: null,
      source: null,
      metadata: undefined,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    }),
    updateContact: (id: string, updates: Record<string, unknown>) => {
      if (id === "c1") {
        return {
          id: "c1",
          firstName: "Jane",
          lastName: "Doe",
          email: updates.email ?? "jane@example.com",
          phone: null,
          title: updates.title ?? "CTO",
          companyId: null,
          source: null,
          metadata: undefined,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-02",
        };
      }
      return null;
    },
  };
}

function createContext(
  crmStore?: ReturnType<typeof createMockCrmStore>
): AgentContext {
  return {
    sessionId: "test-session",
    history: [],
    metadata: {},
    services: { crmStore: crmStore as AgentContext["services"]["crmStore"] },
  };
}

// --- Tests ---

describe("crm_contacts tool", () => {
  describe("search", () => {
    it("returns matching contacts", async () => {
      const store = createMockCrmStore();
      const result = (await crmContactsTool.execute(
        { action: "search", query: "Jane" },
        createContext(store)
      )) as { contacts: unknown[]; total: number; showing: number };

      expect(result.contacts).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.showing).toBe(1);
    });
  });

  describe("get", () => {
    it("returns contact by ID", async () => {
      const store = createMockCrmStore();
      const result = (await crmContactsTool.execute(
        { action: "get", id: "c1" },
        createContext(store)
      )) as { id: string; firstName: string };

      expect(result.id).toBe("c1");
      expect(result.firstName).toBe("Jane");
    });

    it("returns error when contact not found", async () => {
      const store = createMockCrmStore();
      const result = (await crmContactsTool.execute(
        { action: "get", id: "nonexistent" },
        createContext(store)
      )) as { error: string };

      expect(result.error).toContain("not found");
    });
  });

  describe("create", () => {
    it("creates contact with required fields", async () => {
      const store = createMockCrmStore();
      const result = (await crmContactsTool.execute(
        { action: "create", first_name: "John", last_name: "Smith" },
        createContext(store)
      )) as { success: boolean; contact: { id: string } };

      expect(result.success).toBe(true);
      expect(result.contact.id).toBe("c-new");
    });

    it("returns error when required fields missing", async () => {
      const store = createMockCrmStore();
      const result = (await crmContactsTool.execute(
        { action: "create" },
        createContext(store)
      )) as { error: string };

      expect(result.error).toContain("first_name and last_name are required");
    });
  });

  describe("update", () => {
    it("updates existing contact", async () => {
      const store = createMockCrmStore();
      const result = (await crmContactsTool.execute(
        { action: "update", id: "c1", title: "CEO" },
        createContext(store)
      )) as { success: boolean; contact: { title: string } };

      expect(result.success).toBe(true);
      expect(result.contact.title).toBe("CEO");
    });

    it("returns error when contact not found", async () => {
      const store = createMockCrmStore();
      const result = (await crmContactsTool.execute(
        { action: "update", id: "nonexistent", title: "CEO" },
        createContext(store)
      )) as { error: string };

      expect(result.error).toContain("not found");
    });
  });

  describe("error paths", () => {
    it("returns error when store not provided", async () => {
      const result = (await crmContactsTool.execute(
        { action: "search" },
        createContext()
      )) as { error: string };

      expect(result.error).toBe("CRM not initialized");
    });

    it("returns error for unknown action", async () => {
      const store = createMockCrmStore();
      const result = (await crmContactsTool.execute(
        { action: "delete" },
        createContext(store)
      )) as { error: string };

      expect(result.error).toContain("Unknown action");
    });
  });
});
