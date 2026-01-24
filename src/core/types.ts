import { z } from "zod";

// Message types for LLM communication
export type MessageRole = "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

// Token usage for cost tracking
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// Streaming chunks
export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; fullText: string; usage?: TokenUsage };

// Agent context shared across hierarchy
export interface AgentContext {
  sessionId: string;
  history: Message[];
  metadata: Record<string, unknown>;
}

// Tool definition
export const ToolParameterSchema = z.object({
  type: z.literal("object"),
  properties: z.record(
    z.object({
      type: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()).optional(),
    })
  ),
  required: z.array(z.string()).optional(),
});

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter;
  execute: (
    args: Record<string, unknown>,
    context: AgentContext
  ) => Promise<unknown>;
}

// Agent config schema (loaded from YAML)
export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  model: z.object({
    provider: z.enum(["anthropic"]),
    name: z.string(),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(4096),
  }),
  systemPrompt: z.string(),
  tools: z.array(z.string()).default([]),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// LLM provider options
export interface ChatOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  tools?: ToolDefinition[];
}
