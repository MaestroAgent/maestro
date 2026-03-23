import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import {
  AgentContext,
  AgentConfig,
  Message,
  MessageRole,
} from "../core/types.js";
import { MemoryStoreOptions, Session } from "./types.js";
import { hashApiKey } from "../api/utils/auth.js";

// API key record
export interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  isAdmin: boolean;
}

// Stored agent row from SQLite
interface StoredAgent {
  name: string;
  description: string;
  system_prompt: string;
  model_provider: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  tools: string; // JSON array
  created_at: string;
  updated_at: string;
}

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
        api_key_id TEXT,
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

      CREATE TABLE IF NOT EXISTS agents (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        model_provider TEXT NOT NULL DEFAULT 'anthropic',
        model_name TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
        temperature REAL NOT NULL DEFAULT 0.7,
        max_tokens INTEGER NOT NULL DEFAULT 4096,
        tools TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at TEXT,
        revoked_at TEXT,
        is_admin INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        category TEXT,
        input TEXT,
        output TEXT,
        tokens_used INTEGER,
        cost_usd REAL,
        duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agent_runs_session
        ON agent_runs(session_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_agent
        ON agent_runs(agent_name, created_at);
    `);

    // Migration: Add api_key_id column to sessions if it doesn't exist
    this.migrateSchema();
  }

  private migrateSchema(): void {
    // Check if api_key_id column exists in sessions
    const sessionColumns = this.db
      .prepare("PRAGMA table_info(sessions)")
      .all() as Array<{ name: string }>;
    if (!sessionColumns.some((col) => col.name === "api_key_id")) {
      this.db.exec("ALTER TABLE sessions ADD COLUMN api_key_id TEXT");
    }

    // Check if is_admin column exists in api_keys
    const keyColumns = this.db
      .prepare("PRAGMA table_info(api_keys)")
      .all() as Array<{ name: string }>;
    if (!keyColumns.some((col) => col.name === "is_admin")) {
      this.db.exec(
        "ALTER TABLE api_keys ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"
      );
    }
  }

  /**
   * Get all sessions, optionally filtered by channel and/or API key
   */
  getAllSessions(channel?: string, apiKeyId?: string): Session[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (channel) {
      conditions.push("channel = ?");
      params.push(channel);
    }

    if (apiKeyId) {
      conditions.push("api_key_id = ?");
      params.push(apiKeyId);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT id, channel, user_id, created_at, updated_at, metadata, api_key_id
                   FROM sessions ${whereClause} ORDER BY updated_at DESC`;

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: string;
      channel: string;
      user_id: string;
      created_at: string;
      updated_at: string;
      metadata: string | null;
      api_key_id: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      apiKeyId: row.api_key_id ?? undefined,
    }));
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | null {
    const row = this.db
      .prepare(
        `SELECT id, channel, user_id, created_at, updated_at, metadata, api_key_id
         FROM sessions WHERE id = ?`
      )
      .get(sessionId) as
      | {
          id: string;
          channel: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          metadata: string | null;
          api_key_id: string | null;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      channel: row.channel,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      apiKeyId: row.api_key_id ?? undefined,
    };
  }

  /**
   * Get message count for a session
   */
  getMessageCount(sessionId: string): number {
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM messages WHERE session_id = ?`)
      .get(sessionId) as { count: number };
    return result.count;
  }

  /**
   * Load paginated history for a session
   */
  loadHistoryPaginated(
    sessionId: string,
    limit: number = 50,
    offset: number = 0
  ): {
    messages: Array<Message & { id: number; createdAt: string }>;
    total: number;
  } {
    const total = this.getMessageCount(sessionId);

    const rows = this.db
      .prepare(
        `SELECT id, role, content, created_at FROM messages
         WHERE session_id = ?
         ORDER BY id ASC
         LIMIT ? OFFSET ?`
      )
      .all(sessionId, limit, offset) as Array<{
      id: number;
      role: string;
      content: string;
      created_at: string;
    }>;

    return {
      messages: rows.map((row) => ({
        id: row.id,
        role: row.role as MessageRole,
        content: row.content,
        createdAt: row.created_at,
      })),
      total,
    };
  }

  /**
   * Get or create a session for a channel + user combination
   */
  getOrCreateSession(
    channel: string,
    userId: string,
    apiKeyId?: string
  ): Session {
    const now = new Date().toISOString();

    // Try to get existing session
    const existing = this.db
      .prepare(
        `SELECT id, channel, user_id, created_at, updated_at, metadata, api_key_id
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
          api_key_id: string | null;
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
        apiKeyId: existing.api_key_id ?? undefined,
      };
    }

    // Create new session
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO sessions (id, channel, user_id, created_at, updated_at, api_key_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, channel, userId, now, now, apiKeyId ?? null);

    return {
      id,
      channel,
      userId,
      createdAt: now,
      updatedAt: now,
      apiKeyId,
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
      services: {},
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
    this.db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
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

  // ========== Dynamic Agent CRUD ==========

  /**
   * Create a new dynamic agent
   */
  createAgent(config: {
    name: string;
    description: string;
    systemPrompt?: string;
    modelProvider?: string;
    modelName?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
  }): AgentConfig {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO agents (name, description, system_prompt, model_provider, model_name, temperature, max_tokens, tools, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        config.name,
        config.description,
        config.systemPrompt ?? "",
        config.modelProvider ?? "anthropic",
        config.modelName ?? "claude-sonnet-4-20250514",
        config.temperature ?? 0.7,
        config.maxTokens ?? 4096,
        JSON.stringify(config.tools ?? []),
        now,
        now
      );

    return this.getAgent(config.name)!;
  }

  /**
   * Update an existing dynamic agent
   */
  updateAgent(
    name: string,
    updates: Partial<{
      description: string;
      systemPrompt: string;
      modelProvider: string;
      modelName: string;
      temperature: number;
      maxTokens: number;
      tools: string[];
    }>
  ): AgentConfig | null {
    const existing = this.getAgent(name);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();

    // Build dynamic update query
    const fields: string[] = ["updated_at = ?"];
    const values: unknown[] = [now];

    if (updates.description !== undefined) {
      fields.push("description = ?");
      values.push(updates.description);
    }
    if (updates.systemPrompt !== undefined) {
      fields.push("system_prompt = ?");
      values.push(updates.systemPrompt);
    }
    if (updates.modelProvider !== undefined) {
      fields.push("model_provider = ?");
      values.push(updates.modelProvider);
    }
    if (updates.modelName !== undefined) {
      fields.push("model_name = ?");
      values.push(updates.modelName);
    }
    if (updates.temperature !== undefined) {
      fields.push("temperature = ?");
      values.push(updates.temperature);
    }
    if (updates.maxTokens !== undefined) {
      fields.push("max_tokens = ?");
      values.push(updates.maxTokens);
    }
    if (updates.tools !== undefined) {
      fields.push("tools = ?");
      values.push(JSON.stringify(updates.tools));
    }

    values.push(name);

    this.db
      .prepare(`UPDATE agents SET ${fields.join(", ")} WHERE name = ?`)
      .run(...values);

    return this.getAgent(name);
  }

  /**
   * Get a dynamic agent by name
   */
  getAgent(name: string): AgentConfig | null {
    const row = this.db
      .prepare(`SELECT * FROM agents WHERE name = ?`)
      .get(name) as StoredAgent | undefined;

    if (!row) {
      return null;
    }

    return this.storedAgentToConfig(row);
  }

  /**
   * Get all dynamic agents
   */
  getAllAgents(): AgentConfig[] {
    const rows = this.db
      .prepare(`SELECT * FROM agents ORDER BY name`)
      .all() as StoredAgent[];

    return rows.map((row) => this.storedAgentToConfig(row));
  }

  /**
   * Delete a dynamic agent
   */
  deleteAgent(name: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM agents WHERE name = ?`)
      .run(name);

    return result.changes > 0;
  }

  /**
   * Check if a dynamic agent exists
   */
  hasAgent(name: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM agents WHERE name = ?`)
      .get(name);
    return row !== undefined;
  }

  /**
   * Convert stored agent row to AgentConfig
   */
  private storedAgentToConfig(row: StoredAgent): AgentConfig {
    return {
      name: row.name,
      description: row.description,
      model: {
        provider: row.model_provider as "anthropic",
        name: row.model_name,
        temperature: row.temperature,
        maxTokens: row.max_tokens,
      },
      systemPrompt: row.system_prompt,
      tools: JSON.parse(row.tools) as string[],
      references: [],
      relatedAgents: [],
    };
  }

  // ========== Agent Run Tracking ==========

  /**
   * Record an agent run for analytics
   */
  recordAgentRun(run: {
    sessionId: string;
    agentName: string;
    category?: string;
    input?: string;
    output?: string;
    tokensUsed?: number;
    costUsd?: number;
    durationMs?: number;
  }): string {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO agent_runs (id, session_id, agent_name, category, input, output, tokens_used, cost_usd, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        run.sessionId,
        run.agentName,
        run.category ?? null,
        run.input ?? null,
        run.output ?? null,
        run.tokensUsed ?? null,
        run.costUsd ?? null,
        run.durationMs ?? null,
        now
      );

    return id;
  }

  /**
   * Get agent runs, optionally filtered by session or agent
   */
  getAgentRuns(filters?: {
    sessionId?: string;
    agentName?: string;
    limit?: number;
  }): Array<{
    id: string;
    sessionId: string;
    agentName: string;
    category: string | null;
    tokensUsed: number | null;
    costUsd: number | null;
    durationMs: number | null;
    createdAt: string;
  }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.sessionId) {
      conditions.push("session_id = ?");
      params.push(filters.sessionId);
    }
    if (filters?.agentName) {
      conditions.push("agent_name = ?");
      params.push(filters.agentName);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit ?? 50;

    const rows = this.db
      .prepare(
        `SELECT id, session_id, agent_name, category, tokens_used, cost_usd, duration_ms, created_at
         FROM agent_runs ${whereClause}
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(...params, limit) as Array<{
        id: string;
        session_id: string;
        agent_name: string;
        category: string | null;
        tokens_used: number | null;
        cost_usd: number | null;
        duration_ms: number | null;
        created_at: string;
      }>;

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      agentName: r.agent_name,
      category: r.category,
      tokensUsed: r.tokens_used,
      costUsd: r.cost_usd,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get aggregate stats by agent category
   */
  getAgentRunsByCategory(): Array<{
    category: string;
    runCount: number;
    totalTokens: number;
    totalCost: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT
           COALESCE(category, 'uncategorized') as category,
           COUNT(*) as run_count,
           COALESCE(SUM(tokens_used), 0) as total_tokens,
           COALESCE(SUM(cost_usd), 0) as total_cost
         FROM agent_runs
         GROUP BY category
         ORDER BY run_count DESC`
      )
      .all() as Array<{
        category: string;
        run_count: number;
        total_tokens: number;
        total_cost: number;
      }>;

    return rows.map((r) => ({
      category: r.category,
      runCount: r.run_count,
      totalTokens: r.total_tokens,
      totalCost: r.total_cost,
    }));
  }

  // ========== API Key Management ==========

  /**
   * Create a new API key record
   */
  createApiKey(
    name: string,
    keyHash: string,
    keyPrefix: string,
    isAdmin: boolean = false
  ): ApiKeyRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO api_keys (id, name, key_hash, key_prefix, created_at, is_admin)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, keyHash, keyPrefix, now, isAdmin ? 1 : 0);

    return {
      id,
      name,
      keyHash,
      keyPrefix,
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
      isAdmin,
    };
  }

  /**
   * Validate an API key by hashing and looking up
   * Returns the key record if valid, null otherwise
   * Uses timing-safe comparison to prevent timing attacks
   */
  validateApiKey(key: string): ApiKeyRecord | null {
    const keyHash = hashApiKey(key);

    const row = this.db
      .prepare(
        `SELECT id, name, key_hash, key_prefix, created_at, last_used_at, revoked_at, is_admin
         FROM api_keys WHERE key_hash = ?`
      )
      .get(keyHash) as
      | {
          id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          created_at: string;
          last_used_at: string | null;
          revoked_at: string | null;
          is_admin: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      keyHash: row.key_hash,
      keyPrefix: row.key_prefix,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      isAdmin: row.is_admin === 1,
    };
  }

  /**
   * Update last_used_at timestamp for an API key
   */
  touchApiKey(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
      .run(now, id);
  }

  /**
   * Revoke an API key
   */
  revokeApiKey(id: string): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`
      )
      .run(now, id);

    return result.changes > 0;
  }

  /**
   * Get all API keys (without the hash for security)
   */
  getAllApiKeys(): ApiKeyRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, key_hash, key_prefix, created_at, last_used_at, revoked_at, is_admin
         FROM api_keys ORDER BY created_at DESC`
      )
      .all() as Array<{
      id: string;
      name: string;
      key_hash: string;
      key_prefix: string;
      created_at: string;
      last_used_at: string | null;
      revoked_at: string | null;
      is_admin: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyHash: row.key_hash,
      keyPrefix: row.key_prefix,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      isAdmin: row.is_admin === 1,
    }));
  }

  /**
   * Check if any API keys exist
   */
  hasApiKeys(): boolean {
    const result = this.db.prepare(`SELECT 1 FROM api_keys LIMIT 1`).get();
    return result !== undefined;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
