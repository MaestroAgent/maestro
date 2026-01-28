import { ToolDefinition, AgentContext } from "../../core/types.js";
import { DynamicAgentRegistry } from "../../core/registry.js";

// Name validation: alphanumeric and hyphens, 3-30 chars
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

function validateAgentName(name: string): string | null {
  if (!NAME_PATTERN.test(name)) {
    return "Agent name must be 3-30 characters, lowercase alphanumeric with hyphens, cannot start or end with hyphen";
  }
  return null;
}

/**
 * Create agent management tools that use the given registry
 */
export function createAgentTools(
  getRegistry: () => DynamicAgentRegistry
): ToolDefinition[] {
  const createAgentTool: ToolDefinition = {
    name: "create_agent",
    description:
      "Create a new dynamic agent. After creation, you should ask the user for the system prompt and tools to configure.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Unique name for the agent (lowercase, 3-30 chars, alphanumeric with hyphens)",
        },
        description: {
          type: "string",
          description: "Brief description of what this agent does",
        },
        system_prompt: {
          type: "string",
          description: "Optional initial system prompt for the agent",
        },
      },
      required: ["name", "description"],
    },
    execute: async (args: Record<string, unknown>) => {
      const name = args.name as string;
      const description = args.description as string;
      const systemPrompt = args.system_prompt as string | undefined;

      // Validate name format
      const nameError = validateAgentName(name);
      if (nameError) {
        return { success: false, error: nameError };
      }

      const registry = getRegistry();

      // Check for reserved names
      if (registry.isReserved(name)) {
        return {
          success: false,
          error: `Cannot use reserved name "${name}". Reserved names: ${registry.getReservedNames().join(", ")}`,
        };
      }

      // Check if agent already exists
      if (registry.has(name)) {
        return {
          success: false,
          error: `Agent "${name}" already exists. Use update_agent to modify it.`,
        };
      }

      const store = registry.getStore();
      const agent = store.createAgent({
        name,
        description,
        systemPrompt: systemPrompt ?? "",
      });

      const nextSteps = [];
      if (!systemPrompt) {
        nextSteps.push("Set the system_prompt to define the agent's behavior");
      }
      nextSteps.push("Add tools to give the agent capabilities");

      return {
        success: true,
        agent: {
          name: agent.name,
          description: agent.description,
          tools: agent.tools,
          hasSystemPrompt: !!agent.systemPrompt,
        },
        next_steps: nextSteps,
      };
    },
  };

  const updateAgentTool: ToolDefinition = {
    name: "update_agent",
    description:
      "Update a field on an existing dynamic agent (description, system_prompt, tools, temperature, max_tokens, model_name)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the agent to update",
        },
        field: {
          type: "string",
          description: "Field to update",
          enum: [
            "description",
            "system_prompt",
            "tools",
            "temperature",
            "max_tokens",
            "model_name",
          ],
        },
        value: {
          type: "string",
          description:
            'New value for the field. For tools, provide a JSON array like ["calculator", "datetime"]',
        },
      },
      required: ["name", "field", "value"],
    },
    execute: async (args: Record<string, unknown>, context: AgentContext) => {
      const name = args.name as string;
      const field = args.field as string;
      const value = args.value as string;

      const registry = getRegistry();

      // Cannot update static agents
      if (registry.isReserved(name)) {
        return {
          success: false,
          error: `Cannot modify reserved agent "${name}"`,
        };
      }

      // Check agent exists
      if (!registry.has(name)) {
        return {
          success: false,
          error: `Agent "${name}" not found`,
        };
      }

      const store = registry.getStore();

      // Parse and validate the value based on field
      const updates: Record<string, unknown> = {};

      switch (field) {
        case "description":
          updates.description = value;
          break;
        case "system_prompt":
          updates.systemPrompt = value;
          break;
        case "model_name":
          updates.modelName = value;
          break;
        case "temperature": {
          const temp = parseFloat(value);
          if (isNaN(temp) || temp < 0 || temp > 2) {
            return {
              success: false,
              error: "Temperature must be a number between 0 and 2",
            };
          }
          updates.temperature = temp;
          break;
        }
        case "max_tokens": {
          const tokens = parseInt(value, 10);
          if (isNaN(tokens) || tokens < 1) {
            return {
              success: false,
              error: "max_tokens must be a positive integer",
            };
          }
          updates.maxTokens = tokens;
          break;
        }
        case "tools": {
          let toolsArray: string[];
          try {
            toolsArray = JSON.parse(value);
            if (!Array.isArray(toolsArray)) {
              throw new Error("Not an array");
            }
            if (!toolsArray.every((t) => typeof t === "string")) {
              throw new Error("All items must be strings");
            }
          } catch {
            return {
              success: false,
              error:
                'Tools must be a JSON array of strings, e.g. ["calculator", "datetime"]',
            };
          }

          // Get available tools from context metadata (set by orchestrator)
          const availableTools = context.metadata.availableTools as
            | string[]
            | undefined;
          if (availableTools) {
            const invalidTools = toolsArray.filter(
              (t) => !availableTools.includes(t) && t !== "delegate_to_agent"
            );
            if (invalidTools.length > 0) {
              return {
                success: false,
                error: `Unknown tools: ${invalidTools.join(", ")}. Available tools: ${availableTools.join(", ")}`,
              };
            }
          }

          updates.tools = toolsArray;
          break;
        }
        default:
          return {
            success: false,
            error: `Unknown field "${field}"`,
          };
      }

      const updated = store.updateAgent(name, updates);
      if (!updated) {
        return {
          success: false,
          error: `Failed to update agent "${name}"`,
        };
      }

      return {
        success: true,
        agent: {
          name: updated.name,
          description: updated.description,
          tools: updated.tools,
          [field]: field === "tools" ? updated.tools : value,
        },
      };
    },
  };

  const listAgentsTool: ToolDefinition = {
    name: "list_agents",
    description: "List all available agents (both static and dynamic)",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      const registry = getRegistry();
      const agents = registry.getRoutableAgents();

      return {
        agents: agents.map((a) => ({
          name: a.name,
          description: a.description,
          tools: a.tools,
          isDynamic: registry.isDynamic(a.name),
        })),
        total: agents.length,
        dynamic_count: agents.filter((a) => registry.isDynamic(a.name)).length,
      };
    },
  };

  const getAgentTool: ToolDefinition = {
    name: "get_agent",
    description: "Get full details of a specific agent",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the agent to retrieve",
        },
      },
      required: ["name"],
    },
    execute: async (args: Record<string, unknown>) => {
      const name = args.name as string;
      const registry = getRegistry();

      const agent = registry.get(name);
      if (!agent) {
        return {
          success: false,
          error: `Agent "${name}" not found`,
        };
      }

      return {
        success: true,
        agent: {
          name: agent.name,
          description: agent.description,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          tools: agent.tools,
          isDynamic: registry.isDynamic(name),
        },
      };
    },
  };

  const deleteAgentTool: ToolDefinition = {
    name: "delete_agent",
    description:
      "Delete a dynamic agent. Cannot delete static/reserved agents.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the agent to delete",
        },
        confirm: {
          type: "string",
          description:
            "Must be 'yes' to confirm deletion. Ask the user for confirmation first.",
        },
      },
      required: ["name", "confirm"],
    },
    execute: async (args: Record<string, unknown>) => {
      const name = args.name as string;
      const confirm = args.confirm as string;

      if (confirm !== "yes") {
        return {
          success: false,
          error:
            "Deletion not confirmed. Ask the user to confirm, then call with confirm='yes'",
        };
      }

      const registry = getRegistry();

      // Cannot delete static agents
      if (registry.isReserved(name)) {
        return {
          success: false,
          error: `Cannot delete reserved agent "${name}"`,
        };
      }

      // Check agent exists
      if (!registry.has(name)) {
        return {
          success: false,
          error: `Agent "${name}" not found`,
        };
      }

      const store = registry.getStore();
      const deleted = store.deleteAgent(name);

      return {
        success: deleted,
        message: deleted
          ? `Agent "${name}" has been deleted`
          : `Failed to delete agent "${name}"`,
      };
    },
  };

  return [
    createAgentTool,
    updateAgentTool,
    listAgentsTool,
    getAgentTool,
    deleteAgentTool,
  ];
}

// Export tool names for reference
export const agentToolNames = [
  "create_agent",
  "update_agent",
  "list_agents",
  "get_agent",
  "delete_agent",
];
