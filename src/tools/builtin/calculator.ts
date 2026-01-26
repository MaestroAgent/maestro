import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

/**
 * Safe math expression evaluator
 * Supports: +, -, *, /, %, ^, (), and common math functions
 */
function evaluateExpression(expression: string): number {
  // Remove whitespace
  const expr = expression.replace(/\s+/g, "");

  // Validate input - only allow safe characters
  if (!/^[\d+\-*/().,%^a-z]+$/i.test(expr)) {
    throw new Error("Invalid characters in expression");
  }

  // Replace common math functions and constants
  const processed = expr
    .replace(/\^/g, "**") // Power operator
    .replace(/\bpi\b/gi, String(Math.PI))
    .replace(/\be\b/gi, String(Math.E))
    .replace(/\bsqrt\(/gi, "Math.sqrt(")
    .replace(/\babs\(/gi, "Math.abs(")
    .replace(/\bsin\(/gi, "Math.sin(")
    .replace(/\bcos\(/gi, "Math.cos(")
    .replace(/\btan\(/gi, "Math.tan(")
    .replace(/\blog\(/gi, "Math.log10(")
    .replace(/\bln\(/gi, "Math.log(")
    .replace(/\bround\(/gi, "Math.round(")
    .replace(/\bfloor\(/gi, "Math.floor(")
    .replace(/\bceil\(/gi, "Math.ceil(")
    .replace(/\bmin\(/gi, "Math.min(")
    .replace(/\bmax\(/gi, "Math.max(");

  // Final safety check - no other function calls allowed
  if (/[a-z_$][a-z0-9_$]*\s*\(/i.test(processed.replace(/Math\.\w+\(/g, ""))) {
    throw new Error("Unsupported function in expression");
  }

  // Evaluate using Function constructor (safer than eval for math)
  try {
    const fn = new Function(`"use strict"; return (${processed});`);
    const result = fn();

    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error("Expression did not evaluate to a valid number");
    }

    return result;
  } catch (error) {
    throw new Error(
      `Failed to evaluate expression: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const calculatorTool: ToolDefinition = defineTool(
  "calculator",
  "Evaluate mathematical expressions. Supports basic arithmetic (+, -, *, /, %), " +
    "exponents (^), parentheses, and functions like sqrt(), sin(), cos(), tan(), " +
    "log(), ln(), abs(), round(), floor(), ceil(), min(), max(). " +
    "Constants: pi, e",
  {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description:
          "The mathematical expression to evaluate (e.g., '15% * 847', 'sqrt(16) + 2^3')",
      },
    },
    required: ["expression"],
  },
  async (args) => {
    const expression = args.expression as string;

    if (!expression || typeof expression !== "string") {
      return { error: "Expression is required and must be a string" };
    }

    try {
      const result = evaluateExpression(expression);

      // Format result nicely
      const formatted =
        Number.isInteger(result) ? result.toString() : result.toPrecision(10);

      return {
        expression,
        result: parseFloat(formatted),
      };
    } catch (error) {
      return {
        expression,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);
