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
  dbPath?: string;
  maxMessages?: number; // Max messages to retain per session (default: 100)
}
