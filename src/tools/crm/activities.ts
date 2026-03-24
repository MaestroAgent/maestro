import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

export const crmActivitiesTool: ToolDefinition = defineTool(
  "crm_activities",
  "Log and retrieve CRM activities (notes, calls, emails, meetings, tasks) linked to contacts, companies, or deals. " +
    "Use this to record interactions, schedule follow-ups, and review activity history.",
  {
    type: "object",
    properties: {
      action: {
        type: "string",
        description:
          "Action to perform: 'log' (create activity), 'list' (view activities), 'complete' (mark task done)",
      },
      id: {
        type: "string",
        description: "Activity ID (required for 'complete')",
      },
      type: {
        type: "string",
        description: "Activity type: 'note', 'call', 'email', 'meeting', 'task' (required for 'log')",
      },
      subject: {
        type: "string",
        description: "Activity subject or title",
      },
      description: {
        type: "string",
        description: "Activity details or notes",
      },
      contact_id: {
        type: "string",
        description: "Related contact ID",
      },
      company_id: {
        type: "string",
        description: "Related company ID",
      },
      deal_id: {
        type: "string",
        description: "Related deal ID",
      },
      due_date: {
        type: "string",
        description: "Due date for tasks (ISO format, e.g. '2026-04-15')",
      },
      limit: {
        type: "string",
        description: "Max results for list (default: 20)",
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
      case "log": {
        const type = args.type as string;
        if (!type) return { error: "type is required for 'log'" };
        const contactId = args.contact_id as string | undefined;
        const companyId = args.company_id as string | undefined;
        const dealId = args.deal_id as string | undefined;
        if (!contactId && !companyId && !dealId) {
          return { error: "At least one of contact_id, company_id, or deal_id is required" };
        }
        const activity = crm.activities.logActivity({
          type,
          subject: args.subject as string | undefined,
          description: args.description as string | undefined,
          contactId,
          companyId,
          dealId,
          dueDate: args.due_date as string | undefined,
          createdBy: context.metadata?.agentName as string | undefined ?? "agent",
        });
        return { success: true, activity };
      }

      case "list": {
        const limit = parseInt((args.limit as string) || "20", 10);
        const result = crm.activities.listActivities({
          contactId: args.contact_id as string | undefined,
          companyId: args.company_id as string | undefined,
          dealId: args.deal_id as string | undefined,
          type: args.type as string | undefined,
          limit,
        });
        return {
          activities: result.activities,
          total: result.total,
          showing: result.activities.length,
        };
      }

      case "complete": {
        const id = args.id as string;
        if (!id) return { error: "id is required for 'complete'" };
        const activity = crm.activities.completeActivity(id);
        if (!activity) return { error: `Activity not found: ${id}` };
        return { success: true, activity };
      }

      default:
        return { error: `Unknown action: ${action}. Use 'log', 'list', or 'complete'.` };
    }
  },
  { level: "low" }
);
