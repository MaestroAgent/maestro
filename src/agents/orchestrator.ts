import { ToolDefinition, AgentContext, AgentConfig } from "../core/types.js";
import { Agent, ToolRegistry, AgentServices } from "../core/agent.js";
import { DynamicAgentRegistry } from "../core/registry.js";
import { LLMProvider } from "../llm/provider.js";
import { createAgentTools } from "../tools/builtin/agents.js";

/**
 * Build dynamic system prompt by injecting agent list
 */
function buildDynamicPrompt(
  basePrompt: string,
  registry: DynamicAgentRegistry
): string {
  const agents = registry.getRoutableAgents();

  const agentList = agents
    .map((a) => {
      const tools = a.tools.length > 0 ? ` (tools: ${a.tools.join(", ")})` : "";
      return `- **${a.name}**: ${a.description}${tools}`;
    })
    .join("\n");

  // Replace placeholder or append if not present
  if (basePrompt.includes("{{AVAILABLE_AGENTS}}")) {
    return basePrompt.replace("{{AVAILABLE_AGENTS}}", agentList);
  }

  // Fallback: append agent list if no placeholder
  return `${basePrompt}\n\n## Available Agents\n\n${agentList}`;
}

// Factory to create the delegate_to_agent tool with deferred spawner reference
export function createDelegateToAgentTool(
  getSpawner: () => (agentName: string, input: string) => Promise<string>
): ToolDefinition {
  return {
    name: "delegate_to_agent",
    description:
      "Delegate a task to a specialized agent. The agent will process the request and return a response.",
    parameters: {
      type: "object",
      properties: {
        agent_name: {
          type: "string",
          description:
            "The name of the agent to delegate to (e.g., 'personal-assistant')",
        },
        message: {
          type: "string",
          description: "The message/task to send to the agent",
        },
      },
      required: ["agent_name", "message"],
    },
    execute: async (args: Record<string, unknown>, context: AgentContext) => {
      const agentName = args.agent_name as string;
      const message = args.message as string;

      // Track delegation in context metadata
      const delegations = (context.metadata.delegations as string[]) || [];
      delegations.push(agentName);
      context.metadata.delegations = delegations;
      context.metadata.lastAgent = agentName;

      const spawner = getSpawner();
      const response = await spawner(agentName, message);

      return {
        agent: agentName,
        response,
        delegationCount: delegations.length,
      };
    },
  };
}

// Create orchestrator agent with its special tools
export function createOrchestratorAgent(
  config: AgentConfig,
  provider: LLMProvider,
  registry: DynamicAgentRegistry,
  baseToolRegistry: ToolRegistry,
  services: AgentServices,
  context?: AgentContext
): Agent {
  // Use a holder object so we can set the agent reference after creation
  const agentHolder: { agent?: Agent } = {};

  // Build dynamic system prompt with agent list
  const dynamicConfig: AgentConfig = {
    ...config,
    systemPrompt: buildDynamicPrompt(config.systemPrompt, registry),
  };

  // Create tool registry with orchestrator-specific tools
  const toolRegistry = new Map(baseToolRegistry);

  // Add delegate_to_agent tool using deferred reference
  const delegateTool = createDelegateToAgentTool(() => (name, input) => {
    if (!agentHolder.agent) {
      throw new Error("Agent not initialized");
    }
    return agentHolder.agent.spawnSubordinate(name, input);
  });
  toolRegistry.set(delegateTool.name, delegateTool);

  // Add agent management tools
  const agentTools = createAgentTools(() => registry);
  for (const tool of agentTools) {
    toolRegistry.set(tool.name, tool);
  }

  // Create agent registry Map for compatibility with Agent class
  // This map is used for spawning subordinates
  const agentRegistryMap = new Map<string, AgentConfig>();
  for (const agent of registry.getAll()) {
    agentRegistryMap.set(agent.name, agent);
  }

  // Set up context with available tools for tool validation
  const contextWithMeta: AgentContext = context ?? {
    sessionId: "",
    history: [],
    metadata: {},
    services: {},
  };
  contextWithMeta.metadata.availableTools = [...baseToolRegistry.keys()];

  // Create the agent with complete tool registry
  const agent = new Agent({
    config: dynamicConfig,
    provider,
    agentRegistry: agentRegistryMap,
    toolRegistry,
    services,
    context: contextWithMeta,
  });

  // Set the reference for the deferred spawner
  agentHolder.agent = agent;

  return agent;
}
