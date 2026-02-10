import { ToolDefinition } from "../../core/types.js";
import { gscSearchAnalyticsTool } from "./google-search-console.js";
import { googleAnalyticsTool } from "./google-analytics.js";
import { kitTool } from "./kit.js";
import { stripeAnalyticsTool } from "./stripe-analytics.js";

export { gscSearchAnalyticsTool } from "./google-search-console.js";
export { googleAnalyticsTool } from "./google-analytics.js";
export { kitTool } from "./kit.js";
export { stripeAnalyticsTool } from "./stripe-analytics.js";

/**
 * All marketing tool integrations.
 * These are registered alongside built-in tools in the tool registry.
 */
export const marketingTools: ToolDefinition[] = [
  gscSearchAnalyticsTool,
  googleAnalyticsTool,
  kitTool,
  stripeAnalyticsTool,
];
