import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

/**
 * Safe math expression parser using recursive descent
 * This is a secure alternative to Function/eval that:
 * - Cannot execute arbitrary code
 * - Has no access to JavaScript globals or DOM
 * - Only supports mathematical operations
 */

type Token = {
  type: "number" | "operator" | "function" | "lparen" | "rparen" | "comma" | "constant";
  value: string | number;
};

// Supported functions with their implementations
const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  log10: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

// Supported constants
const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
};

/**
 * Tokenize a math expression
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Numbers (including decimals)
    if (/[0-9.]/.test(char)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      // Handle percentage
      if (expr[i] === "%") {
        tokens.push({ type: "number", value: parseFloat(num) / 100 });
        i++;
      } else {
        tokens.push({ type: "number", value: parseFloat(num) });
      }
      continue;
    }

    // Operators
    if ("+-*/^".includes(char)) {
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    // Parentheses
    if (char === "(") {
      tokens.push({ type: "lparen", value: "(" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen", value: ")" });
      i++;
      continue;
    }

    // Comma (for multi-argument functions)
    if (char === ",") {
      tokens.push({ type: "comma", value: "," });
      i++;
      continue;
    }

    // Identifiers (functions and constants)
    if (/[a-zA-Z]/.test(char)) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }

      const lower = ident.toLowerCase();
      if (CONSTANTS[ident] !== undefined || CONSTANTS[lower] !== undefined) {
        tokens.push({ type: "constant", value: ident });
      } else if (MATH_FUNCTIONS[lower]) {
        tokens.push({ type: "function", value: lower });
      } else {
        throw new Error(`Unknown identifier: ${ident}`);
      }
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}

/**
 * Recursive descent parser for math expressions
 * Grammar:
 *   expr    -> term (('+' | '-') term)*
 *   term    -> power (('*' | '/') power)*
 *   power   -> unary ('^' power)?
 *   unary   -> '-' unary | primary
 *   primary -> NUMBER | CONSTANT | FUNCTION '(' args ')' | '(' expr ')'
 *   args    -> expr (',' expr)*
 */
class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): number {
    const result = this.expr();
    if (this.pos < this.tokens.length) {
      throw new Error("Unexpected token after expression");
    }
    return result;
  }

  private current(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expr(): number {
    let left = this.term();

    while (this.current()?.type === "operator" &&
           (this.current()?.value === "+" || this.current()?.value === "-")) {
      const op = this.consume().value;
      const right = this.term();
      left = op === "+" ? left + right : left - right;
    }

    return left;
  }

  private term(): number {
    let left = this.power();

    while (this.current()?.type === "operator" &&
           (this.current()?.value === "*" || this.current()?.value === "/")) {
      const op = this.consume().value;
      const right = this.power();
      left = op === "*" ? left * right : left / right;
    }

    return left;
  }

  private power(): number {
    const base = this.unary();

    if (this.current()?.type === "operator" && this.current()?.value === "^") {
      this.consume();
      const exp = this.power(); // Right associative
      return Math.pow(base, exp);
    }

    return base;
  }

  private unary(): number {
    if (this.current()?.type === "operator" && this.current()?.value === "-") {
      this.consume();
      return -this.unary();
    }
    if (this.current()?.type === "operator" && this.current()?.value === "+") {
      this.consume();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    const token = this.current();

    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    // Number
    if (token.type === "number") {
      this.consume();
      return token.value as number;
    }

    // Constant
    if (token.type === "constant") {
      this.consume();
      const name = token.value as string;
      return CONSTANTS[name] ?? CONSTANTS[name.toLowerCase()];
    }

    // Function
    if (token.type === "function") {
      this.consume();
      const funcName = token.value as string;
      const func = MATH_FUNCTIONS[funcName];

      if (this.current()?.type !== "lparen") {
        throw new Error(`Expected '(' after function ${funcName}`);
      }
      this.consume(); // consume '('

      const args: number[] = [];
      if (this.current()?.type !== "rparen") {
        args.push(this.expr());
        while (this.current()?.type === "comma") {
          this.consume();
          args.push(this.expr());
        }
      }

      if (this.current()?.type !== "rparen") {
        throw new Error("Expected ')' after function arguments");
      }
      this.consume(); // consume ')'

      return func(...args);
    }

    // Parenthesized expression
    if (token.type === "lparen") {
      this.consume();
      const result = this.expr();
      if (this.current()?.type !== "rparen") {
        throw new Error("Expected ')'");
      }
      this.consume();
      return result;
    }

    throw new Error(`Unexpected token: ${token.value}`);
  }
}

/**
 * Evaluate a math expression safely
 */
function evaluateExpression(expression: string): number {
  const expr = expression.trim();

  if (!expr) {
    throw new Error("Empty expression");
  }

  try {
    const tokens = tokenize(expr);
    const parser = new Parser(tokens);
    const result = parser.parse();

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
  "Evaluate mathematical expressions safely. Supports basic arithmetic (+, -, *, /, %), " +
    "exponents (^), parentheses, and functions like sqrt(), sin(), cos(), tan(), " +
    "log(), log10(), abs(), round(), floor(), ceil(), min(), max(), pow(). " +
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
