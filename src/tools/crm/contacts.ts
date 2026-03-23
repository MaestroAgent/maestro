import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

export const crmContactsTool: ToolDefinition = defineTool(
  "crm_contacts",
  "Manage CRM contacts. Search, create, update, and view contact records. " +
    "Contacts can be linked to companies and deals.",
  {
    type: "object",
    properties: {
      action: {
        type: "string",
        description:
          "Action to perform: 'search', 'get', 'create', 'update'",
      },
      id: {
        type: "string",
        description: "Contact ID (required for 'get' and 'update')",
      },
      query: {
        type: "string",
        description: "Search query — matches name, email, or title (for 'search')",
      },
      company_id: {
        type: "string",
        description: "Filter by company ID (for 'search') or link to company (for 'create'/'update')",
      },
      first_name: {
        type: "string",
        description: "First name (required for 'create')",
      },
      last_name: {
        type: "string",
        description: "Last name (required for 'create')",
      },
      email: {
        type: "string",
        description: "Email address",
      },
      phone: {
        type: "string",
        description: "Phone number",
      },
      title: {
        type: "string",
        description: "Job title",
      },
      source: {
        type: "string",
        description: "Lead source (e.g. 'web', 'referral', 'cold', 'event')",
      },
      limit: {
        type: "string",
        description: "Max results for search (default: 20)",
      },
    },
    required: ["action"],
  },
  async (args, context) => {
    const store = context.services.crmStore;
    if (!store) {
      return { error: "CRM not initialized" };
    }

    const action = args.action as string;

    switch (action) {
      case "search": {
        const limit = parseInt((args.limit as string) || "20", 10);
        const result = store.searchContacts({
          query: args.query as string | undefined,
          companyId: args.company_id as string | undefined,
          limit,
        });
        return {
          contacts: result.contacts,
          total: result.total,
          showing: result.contacts.length,
        };
      }

      case "get": {
        const id = args.id as string;
        if (!id) return { error: "id is required for 'get'" };
        const contact = store.getContact(id);
        if (!contact) return { error: `Contact not found: ${id}` };
        return contact;
      }

      case "create": {
        const firstName = args.first_name as string;
        const lastName = args.last_name as string;
        if (!firstName || !lastName)
          return { error: "first_name and last_name are required for 'create'" };
        const contact = store.createContact({
          firstName,
          lastName,
          email: args.email as string | undefined,
          phone: args.phone as string | undefined,
          title: args.title as string | undefined,
          companyId: args.company_id as string | undefined,
          source: args.source as string | undefined,
        });
        return { success: true, contact };
      }

      case "update": {
        const id = args.id as string;
        if (!id) return { error: "id is required for 'update'" };
        const updates: Record<string, unknown> = {};
        if (args.first_name !== undefined) updates.firstName = args.first_name;
        if (args.last_name !== undefined) updates.lastName = args.last_name;
        if (args.email !== undefined) updates.email = args.email;
        if (args.phone !== undefined) updates.phone = args.phone;
        if (args.title !== undefined) updates.title = args.title;
        if (args.company_id !== undefined) updates.companyId = args.company_id;
        if (args.source !== undefined) updates.source = args.source;
        const contact = store.updateContact(id, updates);
        if (!contact) return { error: `Contact not found: ${id}` };
        return { success: true, contact };
      }

      default:
        return { error: `Unknown action: ${action}. Use 'search', 'get', 'create', or 'update'.` };
    }
  },
  { level: "medium" }
);
