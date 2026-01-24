import { ToolDefinition, AgentContext, AgentConfig } from "../core/types.js";
import { Agent, AgentRegistry, ToolRegistry } from "../core/agent.js";
import { LLMProvider } from "../llm/provider.js";

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
  agentRegistry: AgentRegistry,
  baseToolRegistry: ToolRegistry,
  context?: AgentContext
): Agent {
  // Use a holder object so we can set the agent reference after creation
  const agentHolder: { agent?: Agent } = {};

  // Create tool registry with delegate_to_agent tool using deferred reference
  const toolRegistry = new Map(baseToolRegistry);
  const delegateTool = createDelegateToAgentTool(() => (name, input) => {
    if (!agentHolder.agent) {
      throw new Error("Agent not initialized");
    }
    return agentHolder.agent.spawnSubordinate(name, input);
  });
  toolRegistry.set(delegateTool.name, delegateTool);

  // Create the agent with complete tool registry
  const agent = new Agent(
    config,
    provider,
    agentRegistry,
    toolRegistry,
    context
  );

  // Set the reference for the deferred spawner
  agentHolder.agent = agent;

  return agent;
}
