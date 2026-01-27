import { ToolDefinition } from "../core/types.js";
import { ToolRegistry } from "../core/agent.js";

/**
 * Creates a new tool registry and provides helper functions
 */
export function createToolRegistry(): {
  registry: ToolRegistry;
  register: (tool: ToolDefinition) => void;
  registerAll: (tools: ToolDefinition[]) => void;
  get: (name: string) => ToolDefinition | undefined;
  has: (name: string) => boolean;
  list: () => string[];
} {
  const registry: ToolRegistry = new Map<string, ToolDefinition>();

  return {
    registry,

    register(tool: ToolDefinition): void {
      if (registry.has(tool.name)) {
        console.warn(`Tool "${tool.name}" is being overwritten`);
      }
      registry.set(tool.name, tool);
    },

    registerAll(tools: ToolDefinition[]): void {
      for (const tool of tools) {
        this.register(tool);
      }
    },

    get(name: string): ToolDefinition | undefined {
      return registry.get(name);
    },

    has(name: string): boolean {
      return registry.has(name);
    },

    list(): string[] {
      return [...registry.keys()];
    },
  };
}

/**
 * Helper to create a tool definition
 */
export function defineTool(
  name: string,
  description: string,
  parameters: ToolDefinition["parameters"],
  execute: ToolDefinition["execute"],
  permissions?: ToolDefinition["permissions"]
): ToolDefinition {
  return { name, description, parameters, execute, permissions };
}
