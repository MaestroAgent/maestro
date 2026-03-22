import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";
import { getCrmStore } from "../../crm/index.js";

export const crmPipelineTool: ToolDefinition = defineTool(
  "crm_pipeline",
  "View the sales pipeline summary, deal forecasts, and pipeline stage configuration. " +
    "Use this to understand the current state of all deals, forecast revenue, or see available stages.",
  {
    type: "object",
    properties: {
      action: {
        type: "string",
        description:
          "Action to perform: 'summary' (stage-by-stage deal breakdown), 'forecast' (deals expected to close in a period), 'stages' (list all pipeline stages)",
      },
      period: {
        type: "string",
        description:
          "Time period for forecast: 'this_month', 'next_month', 'this_quarter' (only for 'forecast' action)",
      },
    },
    required: ["action"],
  },
  async (args) => {
    const store = getCrmStore();
    if (!store) {
      return { error: "CRM not initialized" };
    }

    const action = args.action as string;

    switch (action) {
      case "summary": {
        const stages = store.getPipelineSummary();
        const totalDeals = stages.reduce((sum, s) => sum + s.dealCount, 0);
        const totalValue = stages.reduce((sum, s) => sum + s.totalValue, 0);
        return {
          stages,
          totalOpenDeals: totalDeals,
          totalPipelineValue: totalValue,
        };
      }

      case "forecast": {
        const period = (args.period as string) || "this_month";
        return store.getDealForecast(period);
      }

      case "stages": {
        return { stages: store.getStages() };
      }

      default:
        return { error: `Unknown action: ${action}. Use 'summary', 'forecast', or 'stages'.` };
    }
  },
  { level: "low" }
);
