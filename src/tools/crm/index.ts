import { ToolDefinition } from "../../core/types.js";
import { crmCompaniesTool } from "./companies.js";
import { crmContactsTool } from "./contacts.js";
import { crmDealsTool } from "./deals.js";
import { crmActivitiesTool } from "./activities.js";
import { crmPipelineTool } from "./pipeline.js";

export { crmCompaniesTool } from "./companies.js";
export { crmContactsTool } from "./contacts.js";
export { crmDealsTool } from "./deals.js";
export { crmActivitiesTool } from "./activities.js";
export { crmPipelineTool } from "./pipeline.js";

export const crmTools: ToolDefinition[] = [
  crmCompaniesTool,
  crmContactsTool,
  crmDealsTool,
  crmActivitiesTool,
  crmPipelineTool,
];
