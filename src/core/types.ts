import { z } from "zod";
import type { CrmStore } from "../crm/store.js";
import type { VectorStore } from "../memory/vectors.js";

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

// Services injected into tools via context
export interface ToolServices {
  crmStore?: CrmStore;
  vectorStore?: VectorStore;
}

// Agent context shared across hierarchy
export interface AgentContext {
  sessionId: string;
  history: Message[];
  metadata: Record<string, unknown>;
  services: ToolServices;
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

// Tool permission levels (from least to most dangerous)
export type ToolPermissionLevel = "low" | "medium" | "high" | "critical";

export interface ToolPermissions {
  level: ToolPermissionLevel;
  requiresAllowlist?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter;
  execute: (
    args: Record<string, unknown>,
    context: AgentContext
  ) => Promise<unknown>;
  permissions?: ToolPermissions;
}

// Agent config schema (loaded from YAML)
export const AgentConfigSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  description: z.string(),
  model: z.object({
    provider: z.enum(["anthropic"]),
    name: z.string(),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(4096),
  }),
  systemPrompt: z.string(),
  tools: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
  relatedAgents: z.array(z.string()).default([]),
  // Maximum tool permission level this agent can access
  // low: calculator, datetime, memory tools
  // medium: browse_web
  // high: clone_project, switch_project
  // critical: claude_code (default: all tools allowed)
  maxToolLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
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
