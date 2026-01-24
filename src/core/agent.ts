import { randomUUID } from "crypto";
import {
  AgentConfig,
  AgentContext,
  StreamChunk,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from "./types.js";
import { LLMProvider } from "../llm/provider.js";
import { getLogger, getCostTracker } from "../observability/index.js";

export interface AgentRuntime {
  id: string;
  config: AgentConfig;
  context: AgentContext;
  superior?: AgentRuntime;
}

export type AgentRegistry = Map<string, AgentConfig>;
export type ToolRegistry = Map<string, ToolDefinition>;

export class Agent implements AgentRuntime {
  id: string;
  config: AgentConfig;
  context: AgentContext;
  superior?: AgentRuntime;

  private provider: LLMProvider;
  private agentRegistry: AgentRegistry;
  private toolRegistry: ToolRegistry;

  constructor(
    config: AgentConfig,
    provider: LLMProvider,
    agentRegistry: AgentRegistry,
    toolRegistry: ToolRegistry,
    context?: AgentContext,
    superior?: AgentRuntime
  ) {
    this.id = randomUUID();
    this.config = config;
    this.provider = provider;
    this.agentRegistry = agentRegistry;
    this.toolRegistry = toolRegistry;
    this.superior = superior;

    // Use provided context or create new one
    this.context = context ?? {
      sessionId: randomUUID(),
      history: [],
      metadata: {},
    };
  }

  async *run(input: string): AsyncGenerator<StreamChunk, string, unknown> {
    const logger = getLogger();
    const costTracker = getCostTracker(this.context.sessionId, this.config.model.name);
    const startTime = Date.now();

    // Track current agent in context
    this.context.metadata.currentAgent = this.config.name;

    // Log agent invocation
    logger.agentInvoke(input, {
      sessionId: this.context.sessionId,
      agentName: this.config.name,
    });

    // Add user message to history
    this.context.history.push({ role: "user", content: input });

    // Get tools available to this agent
    const tools = this.getTools();

    let fullResponse = "";
    let pendingToolCalls: ToolCall[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Agent loop - keep running until we get a final text response
    while (true) {
      const stream = this.provider.chatWithTools(
        this.context.history,
        {
          model: this.config.model.name,
          temperature: this.config.model.temperature,
          maxTokens: this.config.model.maxTokens,
          systemPrompt: this.config.systemPrompt,
          tools,
        },
        pendingToolCalls.length > 0 ? undefined : undefined
      );

      let currentText = "";
      const currentToolCalls: ToolCall[] = [];

      for await (const chunk of stream) {
        if (chunk.type === "text") {
          currentText += chunk.text;
          yield chunk;
        } else if (chunk.type === "tool_call") {
          currentToolCalls.push(chunk.toolCall);
          yield chunk;
        } else if (chunk.type === "done") {
          fullResponse = chunk.fullText;
          // Track token usage
          if (chunk.usage) {
            totalInputTokens += chunk.usage.inputTokens;
            totalOutputTokens += chunk.usage.outputTokens;
          }
        }
      }

      // If no tool calls, we're done
      if (currentToolCalls.length === 0) {
        if (currentText) {
          this.context.history.push({ role: "assistant", content: currentText });
        }
        break;
      }

      // Execute tool calls with logging
      const toolResults = await this.executeToolCalls(currentToolCalls);

      // Add assistant message with tool calls to history
      this.context.history.push({
        role: "assistant",
        content: this.formatToolCallsForHistory(currentToolCalls, currentText),
      });

      // Add tool results as user message
      this.context.history.push({
        role: "user",
        content: this.formatToolResultsForHistory(toolResults),
      });

      pendingToolCalls = [];
    }

    // Record cost
    costTracker.record(
      {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      this.config.name
    );

    // Log response
    const durationMs = Date.now() - startTime;
    logger.agentResponse(totalInputTokens, totalOutputTokens, durationMs, {
      sessionId: this.context.sessionId,
      agentName: this.config.name,
    });

    yield {
      type: "done",
      fullText: fullResponse,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    };
    return fullResponse;
  }

  async spawnSubordinate(agentName: string, input: string): Promise<string> {
    const subConfig = this.agentRegistry.get(agentName);
    if (!subConfig) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    const subordinate = new Agent(
      subConfig,
      this.provider,
      this.agentRegistry,
      this.toolRegistry,
      this.context, // Share context with subordinate
      this
    );

    let result = "";
    for await (const chunk of subordinate.run(input)) {
      if (chunk.type === "text") {
        result += chunk.text;
      }
    }

    return result;
  }

  private getTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const toolName of this.config.tools) {
      const tool = this.toolRegistry.get(toolName);
      if (tool) {
        tools.push(tool);
      }
    }

    return tools;
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const logger = getLogger();
    const results: ToolResult[] = [];
    const logContext = {
      sessionId: this.context.sessionId,
      agentName: this.config.name,
    };

    for (const call of toolCalls) {
      const toolStartTime = Date.now();

      // Log tool call
      logger.toolCall(call.name, call.arguments, logContext);

      const tool = this.toolRegistry.get(call.name);
      if (!tool) {
        const errorResult = `Error: Unknown tool ${call.name}`;
        results.push({
          toolCallId: call.id,
          result: errorResult,
          isError: true,
        });
        logger.toolResult(call.name, errorResult, true, Date.now() - toolStartTime, logContext);
        continue;
      }

      try {
        const result = await tool.execute(call.arguments, this.context);
        results.push({
          toolCallId: call.id,
          result,
        });
        logger.toolResult(call.name, result, false, Date.now() - toolStartTime, logContext);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          toolCallId: call.id,
          result: `Error: ${errorMessage}`,
          isError: true,
        });
        logger.toolResult(call.name, errorMessage, true, Date.now() - toolStartTime, logContext);
      }
    }

    return results;
  }

  private formatToolCallsForHistory(
    toolCalls: ToolCall[],
    text: string
  ): string {
    const parts: string[] = [];
    if (text) {
      parts.push(text);
    }
    for (const call of toolCalls) {
      parts.push(
        `[Tool Call: ${call.name}(${JSON.stringify(call.arguments)})]`
      );
    }
    return parts.join("\n");
  }

  private formatToolResultsForHistory(results: ToolResult[]): string {
    return results
      .map(
        (r) =>
          `[Tool Result for ${r.toolCallId}]: ${JSON.stringify(r.result)}${r.isError ? " (error)" : ""}`
      )
      .join("\n");
  }
}

// Factory function to create agents
export function createAgent(
  config: AgentConfig,
  provider: LLMProvider,
  agentRegistry: AgentRegistry,
  toolRegistry: ToolRegistry,
  context?: AgentContext
): Agent {
  return new Agent(config, provider, agentRegistry, toolRegistry, context);
}
