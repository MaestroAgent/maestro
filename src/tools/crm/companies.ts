import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

export const crmCompaniesTool: ToolDefinition = defineTool(
  "crm_companies",
  "Manage CRM companies. Search, create, update, and view company records. " +
    "Companies can be linked to contacts and deals.",
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
        description: "Company ID (required for 'get' and 'update')",
      },
      query: {
        type: "string",
        description: "Search query — matches company name or domain (for 'search')",
      },
      name: {
        type: "string",
        description: "Company name (required for 'create')",
      },
      domain: {
        type: "string",
        description: "Company website domain (e.g. acme.com)",
      },
      industry: {
        type: "string",
        description: "Industry (e.g. SaaS, Healthcare, Finance)",
      },
      size: {
        type: "string",
        description: "Company size (e.g. '1-10', '11-50', '51-200', '201-1000', '1000+')",
      },
      limit: {
        type: "string",
        description: "Max results for search (default: 20)",
      },
    },
    required: ["action"],
  },
  async (args, context) => {
    const crm = context.services.crm;
    if (!crm) {
      return { error: "CRM not initialized" };
    }

    const action = args.action as string;

    switch (action) {
      case "search": {
        const limit = parseInt((args.limit as string) || "20", 10);
        const result = crm.companies.searchCompanies(args.query as string | undefined, limit);
        return {
          companies: result.companies,
          total: result.total,
          showing: result.companies.length,
        };
      }

      case "get": {
        const id = args.id as string;
        if (!id) return { error: "id is required for 'get'" };
        const company = crm.companies.getCompany(id);
        if (!company) return { error: `Company not found: ${id}` };
        return company;
      }

      case "create": {
        const name = args.name as string;
        if (!name) return { error: "name is required for 'create'" };
        const company = crm.companies.createCompany({
          name,
          domain: args.domain as string | undefined,
          industry: args.industry as string | undefined,
          size: args.size as string | undefined,
        });
        return { success: true, company };
      }

      case "update": {
        const id = args.id as string;
        if (!id) return { error: "id is required for 'update'" };
        const updates: Record<string, unknown> = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.domain !== undefined) updates.domain = args.domain;
        if (args.industry !== undefined) updates.industry = args.industry;
        if (args.size !== undefined) updates.size = args.size;
        const company = crm.companies.updateCompany(id, updates);
        if (!company) return { error: `Company not found: ${id}` };
        return { success: true, company };
      }

      default:
        return { error: `Unknown action: ${action}. Use 'search', 'get', 'create', or 'update'.` };
    }
  },
  { level: "medium" }
);
