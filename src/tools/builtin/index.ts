export { calculatorTool } from "./calculator.js";
export { datetimeTool } from "./datetime.js";
export { claudeCodeTool } from "./claude-code.js";
export {
  cloneProjectTool,
  switchProjectTool,
  listProjectsTool,
  currentProjectTool,
  projectTools,
} from "./projects.js";
export { createAgentTools, agentToolNames } from "./agents.js";

import { ToolDefinition } from "../../core/types.js";
import { calculatorTool } from "./calculator.js";
import { datetimeTool } from "./datetime.js";
import { claudeCodeTool } from "./claude-code.js";
import { projectTools } from "./projects.js";

/**
 * All built-in tools (agent tools are added separately via createAgentTools factory)
 */
export const builtinTools: ToolDefinition[] = [
  calculatorTool,
  datetimeTool,
  claudeCodeTool,
  ...projectTools,
];
