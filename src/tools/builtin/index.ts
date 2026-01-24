export { calculatorTool } from "./calculator.js";
export { datetimeTool } from "./datetime.js";

import { ToolDefinition } from "../../core/types.js";
import { calculatorTool } from "./calculator.js";
import { datetimeTool } from "./datetime.js";

/**
 * All built-in tools
 */
export const builtinTools: ToolDefinition[] = [calculatorTool, datetimeTool];
