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
export {
  rememberTool,
  recallTool,
  forgetTool,
  memoryStatsTool,
  memoryTools,
} from "./memory.js";
export {
  browseWebTool,
  listBrowserPagesTool,
  browserTools,
} from "./browser.js";

import { ToolDefinition, ToolPermissionLevel } from "../../core/types.js";
import { calculatorTool } from "./calculator.js";
import { datetimeTool } from "./datetime.js";
import { claudeCodeTool } from "./claude-code.js";
import { projectTools } from "./projects.js";
import { memoryTools } from "./memory.js";
import { browserTools } from "./browser.js";

/**
 * Tool permission levels:
 * - low: Safe, read-only or computational tools (calculator, datetime, memory)
 * - medium: Network access but limited impact (browse_web)
 * - high: Can modify state or access external resources (clone_project, switch_project)
 * - critical: Can execute arbitrary code or make system changes (claude_code)
 */
const toolPermissionLevels: Record<string, ToolPermissionLevel> = {
  calculator: "low",
  datetime: "low",
  remember: "low",
  recall: "low",
  forget: "low",
  memory_stats: "low",
  list_projects: "low",
  current_project: "low",
  browse_web: "medium",
  list_browser_pages: "medium",
  clone_project: "high",
  switch_project: "high",
  claude_code: "critical",
};

/**
 * Add permission levels to tools
 */
function addPermissions(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((tool) => ({
    ...tool,
    permissions: {
      level: toolPermissionLevels[tool.name] || "low",
    },
  }));
}

/**
 * All built-in tools (agent tools are added separately via createAgentTools factory)
 */
export const builtinTools: ToolDefinition[] = addPermissions([
  calculatorTool,
  datetimeTool,
  claudeCodeTool,
  ...projectTools,
  ...memoryTools,
  ...browserTools,
]);
