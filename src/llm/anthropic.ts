import Anthropic from "@anthropic-ai/sdk";
import { LLMProvider, toolsToSchema } from "./provider.js";
import {
  Message,
  StreamChunk,
  ChatOptions,
  ToolResult,
  ToolCall,
} from "../core/types.js";

type AnthropicMessage = Anthropic.MessageParam;
type AnthropicTool = Anthropic.Tool;

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  async *chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    yield* this.chatWithTools(messages, options);
  }

  async *chatWithTools(
    messages: Message[],
    options: ChatOptions,
    toolResults?: ToolResult[]
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const anthropicMessages = this.convertMessages(messages, toolResults);
    const tools =
      options.tools && options.tools.length > 0
        ? (toolsToSchema(options.tools) as AnthropicTool[])
        : undefined;

    const stream = this.client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: options.systemPrompt,
      messages: anthropicMessages,
      ...(tools && { tools }),
    });

    let fullText = "";
    const toolCalls: ToolCall[] = [];
    let currentToolId = "";
    let currentToolName = "";
    let currentToolInput = "";

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "tool_use") {
          currentToolId = block.id;
          currentToolName = block.name;
          currentToolInput = "";
        }
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          fullText += delta.text;
          yield { type: "text", text: delta.text };
        } else if (delta.type === "input_json_delta") {
          currentToolInput += delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolId && currentToolName) {
          const toolCall: ToolCall = {
            id: currentToolId,
            name: currentToolName,
            arguments: currentToolInput ? JSON.parse(currentToolInput) : {},
          };
          toolCalls.push(toolCall);
          yield { type: "tool_call", toolCall };
          currentToolId = "";
          currentToolName = "";
          currentToolInput = "";
        }
      }
    }

    yield { type: "done", fullText };
  }

  private convertMessages(
    messages: Message[],
    toolResults?: ToolResult[]
  ): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      result.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // If we have tool results, we need to add them as a user message
    // following the assistant's tool_use response
    if (toolResults && toolResults.length > 0) {
      result.push({
        role: "user",
        content: toolResults.map((tr) => ({
          type: "tool_result" as const,
          tool_use_id: tr.toolCallId,
          content: JSON.stringify(tr.result),
          is_error: tr.isError,
        })),
      });
    }

    return result;
  }
}

// Helper to extract tool calls from a final response
export function extractToolCalls(response: Anthropic.Message): ToolCall[] {
  return response.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: block.input as Record<string, unknown>,
    }));
}
