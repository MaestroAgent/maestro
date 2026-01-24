import {
  Message,
  StreamChunk,
  ChatOptions,
  ToolDefinition,
  ToolCall,
  ToolResult,
} from "../core/types.js";

export interface LLMProvider {
  chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;

  chatWithTools(
    messages: Message[],
    options: ChatOptions,
    toolResults?: ToolResult[]
  ): AsyncGenerator<StreamChunk, void, unknown>;
}

// Convert our tool definitions to provider-specific format
export function toolsToSchema(tools: ToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

// Re-export types for convenience
export type { Message, StreamChunk, ChatOptions, ToolDefinition, ToolCall };
