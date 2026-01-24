import { AgentConfig, AgentContext } from "../core/types.js";
import { Agent, AgentRegistry, ToolRegistry } from "../core/agent.js";
import { LLMProvider } from "../llm/provider.js";

// Create personal assistant agent (no special tools, uses config as-is)
export function createPersonalAssistantAgent(
  config: AgentConfig,
  provider: LLMProvider,
  agentRegistry: AgentRegistry,
  toolRegistry: ToolRegistry,
  context?: AgentContext
): Agent {
  return new Agent(config, provider, agentRegistry, toolRegistry, context);
}
