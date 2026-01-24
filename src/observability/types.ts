/**
 * Log levels
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Base event structure for all log events
 */
export interface BaseLogEvent {
  timestamp: string;
  level: LogLevel;
  event: string;
  sessionId?: string;
  agentName?: string;
}

/**
 * Agent invocation event
 */
export interface AgentInvokeEvent extends BaseLogEvent {
  event: "agent.invoke";
  input: string;
}

/**
 * Agent response event
 */
export interface AgentResponseEvent extends BaseLogEvent {
  event: "agent.response";
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * Tool call event
 */
export interface ToolCallEvent extends BaseLogEvent {
  event: "tool.call";
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result event
 */
export interface ToolResultEvent extends BaseLogEvent {
  event: "tool.result";
  toolName: string;
  result: unknown;
  isError: boolean;
  durationMs: number;
}

/**
 * Error event
 */
export interface ErrorEvent extends BaseLogEvent {
  event: "error";
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
}

/**
 * Session event
 */
export interface SessionEvent extends BaseLogEvent {
  event: "session.start" | "session.end";
  channel?: string;
  userId?: string;
}

/**
 * Union of all log events
 */
export type LogEvent =
  | AgentInvokeEvent
  | AgentResponseEvent
  | ToolCallEvent
  | ToolResultEvent
  | ErrorEvent
  | SessionEvent;

/**
 * Token usage for a single request
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Cost calculation result
 */
export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: "USD";
}

/**
 * Session cost summary
 */
export interface SessionCostSummary {
  sessionId: string;
  requests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost: CostEstimate;
  byAgent: Record<
    string,
    {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      estimatedCost: CostEstimate;
    }
  >;
}
