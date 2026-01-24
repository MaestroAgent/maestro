import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { AgentContext, Message, MessageRole } from "../core/types.js";
import { MemoryStoreOptions, Session } from "./types.js";

export class MemoryStore {
  private db: Database.Database;
  private maxMessages: number;

  constructor(options: MemoryStoreOptions = {}) {
    const dbPath = options.dbPath ?? "./data/maestro.db";
    this.maxMessages = options.maxMessages ?? 100;

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT,
        UNIQUE(channel, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages(session_id, id);

      CREATE INDEX IF NOT EXISTS idx_sessions_channel_user
        ON sessions(channel, user_id);
    `);
  }

  /**
   * Get or create a session for a channel + user combination
   */
  getOrCreateSession(channel: string, userId: string): Session {
    const now = new Date().toISOString();

    // Try to get existing session
    const existing = this.db
      .prepare(
        `SELECT id, channel, user_id, created_at, updated_at, metadata
         FROM sessions WHERE channel = ? AND user_id = ?`
      )
      .get(channel, userId) as
      | {
          id: string;
          channel: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          metadata: string | null;
        }
      | undefined;

    if (existing) {
      return {
        id: existing.id,
        channel: existing.channel,
        userId: existing.user_id,
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
        metadata: existing.metadata ? JSON.parse(existing.metadata) : undefined,
      };
    }

    // Create new session
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO sessions (id, channel, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, channel, userId, now, now);

    return {
      id,
      channel,
      userId,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Load conversation history for a session
   */
  loadHistory(sessionId: string): Message[] {
    const rows = this.db
      .prepare(
        `SELECT role, content FROM messages
         WHERE session_id = ?
         ORDER BY id ASC`
      )
      .all(sessionId) as { role: string; content: string }[];

    return rows.map((row) => ({
      role: row.role as MessageRole,
      content: row.content,
    }));
  }

  /**
   * Save a message to a session
   */
  saveMessage(sessionId: string, role: MessageRole, content: string): void {
    const now = new Date().toISOString();

    // Insert the message
    this.db
      .prepare(
        `INSERT INTO messages (session_id, role, content, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(sessionId, role, content, now);

    // Update session updated_at
    this.db
      .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
      .run(now, sessionId);

    // Trim old messages if needed
    this.trimMessages(sessionId);
  }

  /**
   * Save multiple messages at once (for batch updates)
   */
  saveMessages(sessionId: string, messages: Message[]): void {
    const now = new Date().toISOString();

    const insertStmt = this.db.prepare(
      `INSERT INTO messages (session_id, role, content, created_at)
       VALUES (?, ?, ?, ?)`
    );

    const insertMany = this.db.transaction((msgs: Message[]) => {
      for (const msg of msgs) {
        insertStmt.run(sessionId, msg.role, msg.content, now);
      }
    });

    insertMany(messages);

    // Update session updated_at
    this.db
      .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
      .run(now, sessionId);

    // Trim old messages if needed
    this.trimMessages(sessionId);
  }

  /**
   * Create AgentContext from stored session
   */
  createContext(session: Session): AgentContext {
    return {
      sessionId: session.id,
      history: this.loadHistory(session.id),
      metadata: {
        channel: session.channel,
        userId: session.userId,
        ...session.metadata,
      },
    };
  }

  /**
   * Sync context history back to storage
   */
  syncContext(context: AgentContext): void {
    // Get current stored count
    const countResult = this.db
      .prepare(`SELECT COUNT(*) as count FROM messages WHERE session_id = ?`)
      .get(context.sessionId) as { count: number };

    const storedCount = countResult.count;
    const currentCount = context.history.length;

    // Only save new messages
    if (currentCount > storedCount) {
      const newMessages = context.history.slice(storedCount);
      this.saveMessages(context.sessionId, newMessages);
    }
  }

  /**
   * Clear all messages for a session
   */
  clearSession(sessionId: string): void {
    this.db
      .prepare(`DELETE FROM messages WHERE session_id = ?`)
      .run(sessionId);
  }

  /**
   * Delete a session entirely
   */
  deleteSession(sessionId: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  }

  /**
   * Trim old messages to keep under max limit
   */
  private trimMessages(sessionId: string): void {
    const countResult = this.db
      .prepare(`SELECT COUNT(*) as count FROM messages WHERE session_id = ?`)
      .get(sessionId) as { count: number };

    if (countResult.count > this.maxMessages) {
      const toDelete = countResult.count - this.maxMessages;
      this.db
        .prepare(
          `DELETE FROM messages WHERE id IN (
            SELECT id FROM messages
            WHERE session_id = ?
            ORDER BY id ASC
            LIMIT ?
          )`
        )
        .run(sessionId, toDelete);
    }
  }

  /**
   * Update session metadata
   */
  updateSessionMetadata(
    sessionId: string,
    metadata: Record<string, unknown>
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE sessions SET metadata = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(metadata), now, sessionId);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
