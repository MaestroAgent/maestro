import { z } from "zod";
import { MessageRole } from "../core/types.js";

// Session schema for database storage
export const SessionSchema = z.object({
  id: z.string(),
  channel: z.string(), // "telegram", "cli", etc.
  userId: z.string(), // Channel-specific user ID
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
  apiKeyId: z.string().optional(), // API key that owns this session
});

export type Session = z.infer<typeof SessionSchema>;

// Message schema for database storage
export const StoredMessageSchema = z.object({
  id: z.number(),
  sessionId: z.string(),
  role: z.enum(["user", "assistant"]) as z.ZodType<MessageRole>,
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type StoredMessage = z.infer<typeof StoredMessageSchema>;

// Options for memory store
export interface MemoryStoreOptions {
  maxMessages?: number; // Max messages to retain per session (default: 100)
}

// Semantic memory types
export type MemoryType = "fact" | "preference" | "context" | "learning";

export const SemanticMemorySchema = z.object({
  id: z.string(),
  sessionId: z.string().optional(), // null for global memories
  content: z.string(),
  type: z.enum(["fact", "preference", "context", "learning"]),
  confidence: z.number().min(0).max(1).default(1.0),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type SemanticMemory = z.infer<typeof SemanticMemorySchema>;

export interface MemorySearchResult {
  memory: SemanticMemory;
  score: number;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  getModelName(): string;
}
