export { calculatorTool } from "./calculator.js";
export { datetimeTool } from "./datetime.js";
export { claudeCodeTool } from "./claude-code.js";

import { ToolDefinition } from "../../core/types.js";
import { calculatorTool } from "./calculator.js";
import { datetimeTool } from "./datetime.js";
import { claudeCodeTool } from "./claude-code.js";

/**
 * All built-in tools
 */
export const builtinTools: ToolDefinition[] = [calculatorTool, datetimeTool, claudeCodeTool];
