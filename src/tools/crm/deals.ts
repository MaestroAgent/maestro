import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

export const crmDealsTool: ToolDefinition = defineTool(
  "crm_deals",
  "Manage CRM deals/opportunities. Search, create, update, move through pipeline stages, and close deals. " +
    "Deals track revenue opportunities linked to companies and contacts.",
  {
    type: "object",
    properties: {
      action: {
        type: "string",
        description:
          "Action to perform: 'search', 'get', 'create', 'update', 'move_stage', 'close'",
      },
      id: {
        type: "string",
        description: "Deal ID (required for 'get', 'update', 'move_stage', 'close')",
      },
      query: {
        type: "string",
        description: "Search by deal title (for 'search')",
      },
      stage: {
        type: "string",
        description:
          "Stage name — filter deals by stage (for 'search'), or target stage (for 'move_stage'). " +
          "Default stages: Lead, Qualified, Proposal, Negotiation, Closed Won, Closed Lost",
      },
      title: {
        type: "string",
        description: "Deal title (required for 'create')",
      },
      company_id: {
        type: "string",
        description: "Associated company ID",
      },
      contact_id: {
        type: "string",
        description: "Primary contact ID",
      },
      value: {
        type: "string",
        description: "Deal value as a number (e.g. '50000')",
      },
      currency: {
        type: "string",
        description: "Currency code (default: USD)",
      },
      expected_close_date: {
        type: "string",
        description: "Expected close date (ISO format, e.g. '2026-06-30')",
      },
      won: {
        type: "string",
        description: "For 'close' action: 'true' for won, 'false' for lost",
      },
      lost_reason: {
        type: "string",
        description: "For 'close' action when lost: reason the deal was lost",
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
        const stageName = args.stage as string | undefined;
        let stageId: string | undefined;
        if (stageName) {
          const stage = crm.pipeline.getStageByName(stageName);
          if (!stage) return { error: `Unknown stage: ${stageName}` };
          stageId = stage.id;
        }
        const result = crm.deals.searchDeals({
          query: args.query as string | undefined,
          stageId,
          companyId: args.company_id as string | undefined,
          contactId: args.contact_id as string | undefined,
          limit,
        });
        return {
          deals: result.deals,
          total: result.total,
          showing: result.deals.length,
        };
      }

      case "get": {
        const id = args.id as string;
        if (!id) return { error: "id is required for 'get'" };
        const deal = crm.deals.getDeal(id);
        if (!deal) return { error: `Deal not found: ${id}` };

        // Enrich with stage name, company name, contact name
        const stages = crm.pipeline.getStages();
        const stage = stages.find((s) => s.id === deal.stageId);
        const company = deal.companyId ? crm.companies.getCompany(deal.companyId) : null;
        const contact = deal.contactId ? crm.contacts.getContact(deal.contactId) : null;

        return {
          ...deal,
          stageName: stage?.name ?? "unknown",
          companyName: company?.name ?? null,
          contactName: contact
            ? `${contact.firstName} ${contact.lastName}`
            : null,
        };
      }

      case "create": {
        const title = args.title as string;
        const stageName = (args.stage as string) || "Lead";
        if (!title) return { error: "title is required for 'create'" };

        const stage = crm.pipeline.getStageByName(stageName);
        if (!stage) return { error: `Unknown stage: ${stageName}` };

        const value = args.value ? parseFloat(args.value as string) : undefined;
        const deal = crm.deals.createDeal({
          title,
          stageId: stage.id,
          companyId: args.company_id as string | undefined,
          contactId: args.contact_id as string | undefined,
          value,
          currency: args.currency as string | undefined,
          expectedCloseDate: args.expected_close_date as string | undefined,
        });
        return { success: true, deal, stageName: stage.name };
      }

      case "update": {
        const id = args.id as string;
        if (!id) return { error: "id is required for 'update'" };
        const updates: Record<string, unknown> = {};
        if (args.title !== undefined) updates.title = args.title;
        if (args.company_id !== undefined) updates.companyId = args.company_id;
        if (args.contact_id !== undefined) updates.contactId = args.contact_id;
        if (args.value !== undefined)
          updates.value = parseFloat(args.value as string);
        if (args.currency !== undefined) updates.currency = args.currency;
        if (args.expected_close_date !== undefined)
          updates.expectedCloseDate = args.expected_close_date;
        const deal = crm.deals.updateDeal(id, updates);
        if (!deal) return { error: `Deal not found: ${id}` };
        return { success: true, deal };
      }

      case "move_stage": {
        const id = args.id as string;
        const stageName = args.stage as string;
        if (!id) return { error: "id is required for 'move_stage'" };
        if (!stageName) return { error: "stage is required for 'move_stage'" };

        const stage = crm.pipeline.getStageByName(stageName);
        if (!stage) return { error: `Unknown stage: ${stageName}` };

        const deal = crm.deals.moveDealStage(id, stage.id);
        if (!deal) return { error: `Deal not found: ${id}` };
        return { success: true, deal, newStage: stage.name };
      }

      case "close": {
        const id = args.id as string;
        const wonStr = args.won as string;
        if (!id) return { error: "id is required for 'close'" };
        if (wonStr === undefined)
          return { error: "won is required for 'close' ('true' or 'false')" };

        const won = wonStr === "true";
        const lostReason = args.lost_reason as string | undefined;
        const deal = crm.deals.closeDeal(id, won, lostReason);
        if (!deal) return { error: `Deal not found: ${id}` };
        return {
          success: true,
          deal,
          outcome: won ? "won" : "lost",
        };
      }

      default:
        return {
          error: `Unknown action: ${action}. Use 'search', 'get', 'create', 'update', 'move_stage', or 'close'.`,
        };
    }
  },
  { level: "medium" }
);
