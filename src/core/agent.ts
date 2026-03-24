import { randomUUID } from "crypto";
import {
  AgentConfig,
  AgentContext,
  StreamChunk,
  ToolCall,
  ToolDefinition,
  ToolPermissionLevel,
  ToolResult,
} from "./types.js";
import { LLMProvider } from "../llm/provider.js";
import type { Logger } from "../observability/logger.js";
import type { CostTracker } from "../observability/cost.js";
import type { BudgetGuard } from "../observability/budget.js";

export interface AgentRuntime {
  id: string;
  config: AgentConfig;
  context: AgentContext;
  superior?: AgentRuntime;
}

export type AgentRegistry = Map<string, AgentConfig>;
export type ToolRegistry = Map<string, ToolDefinition>;

export interface AgentServices {
  logger: Logger;
  costTracker: CostTracker;
  budgetGuard?: BudgetGuard;
  crm?: import("../crm/index.js").CrmServices;
  vectorStore?: import("../memory/vectors.js").VectorStore;
}

export interface AgentOptions {
  config: AgentConfig;
  provider: LLMProvider;
  agentRegistry: AgentRegistry;
  toolRegistry: ToolRegistry;
  services: AgentServices;
  context?: AgentContext;
  superior?: AgentRuntime;
}

export class Agent implements AgentRuntime {
  id: string;
  config: AgentConfig;
  context: AgentContext;
  superior?: AgentRuntime;

  private provider: LLMProvider;
  private agentRegistry: AgentRegistry;
  private toolRegistry: ToolRegistry;
  private services: AgentServices;

  constructor(options: AgentOptions) {
    this.id = randomUUID();
    this.config = options.config;
    this.provider = options.provider;
    this.agentRegistry = options.agentRegistry;
    this.toolRegistry = options.toolRegistry;
    this.services = options.services;
    this.superior = options.superior;

    // Use provided context or create new one
    this.context = options.context ?? {
      sessionId: randomUUID(),
      history: [],
      metadata: {},
      services: {},
    };

    // Populate context.services from AgentServices
    this.context.services = {
      ...this.context.services,
      crm: options.services.crm ?? this.context.services.crm,
      vectorStore:
        options.services.vectorStore ?? this.context.services.vectorStore,
    };
  }

  async *run(input: string): AsyncGenerator<StreamChunk, string, unknown> {
    const { logger, costTracker, budgetGuard } = this.services;
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

    // Safety limits to prevent runaway loops
    const MAX_TOOL_ROUNDS = 10;
    const MAX_CONSECUTIVE_ERRORS = 3;
    let toolRounds = 0;
    let consecutiveErrors = 0;

    // Agent loop - keep running until we get a final text response
    while (true) {
      // Check safety limits
      if (toolRounds >= MAX_TOOL_ROUNDS) {
        const limitMsg = `I've reached the maximum number of tool calls (${MAX_TOOL_ROUNDS}). Please try breaking down your request into smaller steps.`;
        yield { type: "text", text: limitMsg };
        this.context.history.push({ role: "assistant", content: limitMsg });
        break;
      }

      // Check budget before making API call
      if (budgetGuard) {
        const budgetCheck = budgetGuard.checkBudget();
        if (!budgetCheck.allowed) {
          const budgetMsg =
            budgetCheck.message || "Daily budget limit reached.";
          yield { type: "text", text: budgetMsg };
          this.context.history.push({ role: "assistant", content: budgetMsg });
          break;
        }
        // Show warning if approaching limit (only on first round to avoid spam)
        if (budgetCheck.message && toolRounds === 0) {
          yield { type: "text", text: budgetCheck.message + "\n\n" };
        }
      }
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
      const textChunks: StreamChunk[] = [];

      for await (const chunk of stream) {
        if (chunk.type === "text") {
          currentText += chunk.text;
          textChunks.push(chunk); // Buffer text, don't yield yet
        } else if (chunk.type === "tool_call") {
          currentToolCalls.push(chunk.toolCall);
          // Don't yield tool calls to stream - they're internal
        } else if (chunk.type === "done") {
          fullResponse = chunk.fullText;
          // Track token usage
          if (chunk.usage) {
            totalInputTokens += chunk.usage.inputTokens;
            totalOutputTokens += chunk.usage.outputTokens;

            // Record spending in budget guard
            if (budgetGuard) {
              budgetGuard.recordSpending(
                {
                  ...chunk.usage,
                  totalTokens:
                    chunk.usage.inputTokens + chunk.usage.outputTokens,
                },
                this.config.model.name
              );
            }
          }
        }
      }

      // If no tool calls, yield the text and we're done
      if (currentToolCalls.length === 0) {
        // Now yield the buffered text chunks
        for (const chunk of textChunks) {
          yield chunk;
        }
        if (currentText) {
          this.context.history.push({
            role: "assistant",
            content: currentText,
          });
        }
        break;
      }

      // If there are tool calls, don't yield the "thinking" text - just execute tools
      toolRounds++;

      // Execute tool calls with logging
      const toolResults = await this.executeToolCalls(currentToolCalls);

      // Track consecutive errors
      const hasErrors = toolResults.some((r) => r.isError);
      if (hasErrors) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const errorMsg = `I've encountered ${consecutiveErrors} consecutive errors with tools. There may be a configuration issue. Please check the logs or try a different approach.`;
          yield { type: "text", text: errorMsg };
          this.context.history.push({ role: "assistant", content: errorMsg });
          break;
        }
      } else {
        consecutiveErrors = 0;
      }

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

    const subordinate = new Agent({
      config: subConfig,
      provider: this.provider,
      agentRegistry: this.agentRegistry,
      toolRegistry: this.toolRegistry,
      services: this.services,
      context: this.context, // Share context with subordinate
      superior: this,
    });

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
    const maxLevel = this.config.maxToolLevel;

    for (const toolName of this.config.tools) {
      const tool = this.toolRegistry.get(toolName);
      if (tool) {
        // Filter by permission level if maxToolLevel is set
        if (maxLevel && tool.permissions) {
          if (!this.isToolAllowed(tool.permissions.level, maxLevel)) {
            continue;
          }
        }
        tools.push(tool);
      }
    }

    return tools;
  }

  /**
   * Check if a tool's permission level is allowed given the agent's max level
   */
  private isToolAllowed(
    toolLevel: ToolPermissionLevel,
    maxLevel: ToolPermissionLevel
  ): boolean {
    const levelOrder: ToolPermissionLevel[] = [
      "low",
      "medium",
      "high",
      "critical",
    ];
    const toolIndex = levelOrder.indexOf(toolLevel);
    const maxIndex = levelOrder.indexOf(maxLevel);
    return toolIndex <= maxIndex;
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const logger = this.services.logger;
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
        logger.toolResult(
          call.name,
          errorResult,
          true,
          Date.now() - toolStartTime,
          logContext
        );
        continue;
      }

      try {
        const result = await tool.execute(call.arguments, this.context);
        results.push({
          toolCallId: call.id,
          result,
        });
        logger.toolResult(
          call.name,
          result,
          false,
          Date.now() - toolStartTime,
          logContext
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({
          toolCallId: call.id,
          result: `Error: ${errorMessage}`,
          isError: true,
        });
        logger.toolResult(
          call.name,
          errorMessage,
          true,
          Date.now() - toolStartTime,
          logContext
        );
      }
    }

    return results;
  }

  private formatToolCallsForHistory(
    toolCalls: ToolCall[],
    text: string
  ): string {
    // Only include text, not tool call details - we don't want the model to mimic the format
    // The tool results will provide the context needed
    if (text) {
      return text;
    }
    // If no text, just note that tools were used (without the parseable format)
    return `(used ${toolCalls.map((c) => c.name).join(", ")})`;
  }

  private formatToolResultsForHistory(results: ToolResult[]): string {
    // Format results in a way that's useful but won't be mimicked as syntax
    return results
      .map((r) => {
        const resultStr =
          typeof r.result === "string"
            ? r.result
            : JSON.stringify(r.result, null, 2);
        return r.isError ? `Error: ${resultStr}` : resultStr;
      })
      .join("\n\n");
  }
}
