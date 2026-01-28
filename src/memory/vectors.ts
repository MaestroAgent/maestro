import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import {
  EmbeddingProvider,
  SemanticMemory,
  MemorySearchResult,
  MemoryType,
} from "./types.js";
import { getDefaultEmbeddingProvider } from "./embeddings.js";

export interface VectorStoreOptions {
  dbPath: string;
  embeddingProvider?: EmbeddingProvider;
}

/**
 * Computes cosine similarity between two vectors
 * Returns a value between -1 and 1, where 1 means identical direction
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * VectorStore provides persistent semantic memory storage with vector similarity search.
 *
 * Key improvements over FAISS-based implementation:
 * - Fully persistent: embeddings are stored in SQLite, not lost on restart
 * - No native dependencies: uses pure JS cosine similarity
 * - FTS5 support: enables hybrid search (vector + keyword)
 */
export class VectorStore {
  private db: Database.Database;
  private embedder: EmbeddingProvider;
  private ftsEnabled: boolean = false;

  constructor(options: VectorStoreOptions) {
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.embedder = options.embeddingProvider ?? getDefaultEmbeddingProvider();

    this.initSchema();
  }

  private initSchema(): void {
    // Core memory tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS memory_embeddings (
        memory_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memories_session
        ON memories(session_id);

      CREATE INDEX IF NOT EXISTS idx_memories_type
        ON memories(type);
    `);

    // Try to create FTS5 virtual table for keyword search
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          content,
          id UNINDEXED,
          session_id UNINDEXED,
          type UNINDEXED,
          tokenize='porter'
        );
      `);
      this.ftsEnabled = true;
    } catch {
      // FTS5 not available, proceed without keyword search
      this.ftsEnabled = false;
    }

    // Embedding cache table for reducing API costs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (provider, model, content_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_cache_created
        ON embedding_cache(created_at);
    `);
  }

  async add(
    content: string,
    type: MemoryType,
    sessionId?: string,
    confidence: number = 1.0,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Generate embedding
    const embeddings = await this.embedder.embed([content]);
    const embedding = embeddings[0];
    const dimensions = embedding.length;

    // Store memory
    this.db
      .prepare(
        `INSERT INTO memories (id, session_id, content, type, confidence, created_at, updated_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        sessionId ?? null,
        content,
        type,
        confidence,
        now,
        now,
        metadata ? JSON.stringify(metadata) : null
      );

    // Store embedding as BLOB
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    this.db
      .prepare(
        `INSERT INTO memory_embeddings (memory_id, embedding, model, dimensions)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, embeddingBuffer, this.embedder.getModelName(), dimensions);

    // Update FTS index if available
    if (this.ftsEnabled) {
      try {
        this.db
          .prepare(
            `INSERT INTO memories_fts (content, id, session_id, type)
             VALUES (?, ?, ?, ?)`
          )
          .run(content, id, sessionId ?? null, type);
      } catch {
        // FTS insert failed, continue without it
      }
    }

    return id;
  }

  async search(
    query: string,
    limit: number = 5,
    sessionId?: string,
    types?: MemoryType[]
  ): Promise<MemorySearchResult[]> {
    // Generate query embedding
    const embeddings = await this.embedder.embed([query]);
    const queryEmbedding = embeddings[0];

    // Load all candidate embeddings
    let sql = `
      SELECT me.memory_id, me.embedding, m.session_id, m.type
      FROM memory_embeddings me
      JOIN memories m ON m.id = me.memory_id
      WHERE 1=1
    `;
    const params: (string | null)[] = [];

    if (sessionId) {
      sql += ` AND (m.session_id = ? OR m.session_id IS NULL)`;
      params.push(sessionId);
    }

    if (types && types.length > 0) {
      sql += ` AND m.type IN (${types.map(() => "?").join(", ")})`;
      params.push(...types);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      memory_id: string;
      embedding: Buffer;
      session_id: string | null;
      type: string;
    }>;

    // Compute similarities
    const scored: Array<{ memoryId: string; similarity: number }> = [];

    for (const row of rows) {
      const embedding = Array.from(
        new Float32Array(
          row.embedding.buffer.slice(
            row.embedding.byteOffset,
            row.embedding.byteOffset + row.embedding.byteLength
          )
        )
      );
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      scored.push({ memoryId: row.memory_id, similarity });
    }

    // Sort by similarity and take top results
    scored.sort((a, b) => b.similarity - a.similarity);
    const topResults = scored.slice(0, limit);

    // Load full memory objects
    const results: MemorySearchResult[] = [];
    for (const { memoryId, similarity } of topResults) {
      const memory = this.getMemory(memoryId);
      if (memory) {
        // Convert cosine similarity (which ranges -1 to 1) to a 0-1 score
        const score = (similarity + 1) / 2;
        results.push({ memory, score });
      }
    }

    return results;
  }

  /**
   * Performs keyword search using FTS5
   * Returns memories matching the query with BM25 scores
   */
  searchKeyword(
    query: string,
    limit: number = 5,
    sessionId?: string,
    types?: MemoryType[]
  ): MemorySearchResult[] {
    if (!this.ftsEnabled) {
      return [];
    }

    let sql = `
      SELECT id, rank
      FROM memories_fts
      WHERE memories_fts MATCH ?
    `;
    const params: (string | null)[] = [query];

    if (sessionId) {
      sql += ` AND (session_id = ? OR session_id IS NULL)`;
      params.push(sessionId);
    }

    if (types && types.length > 0) {
      sql += ` AND type IN (${types.map(() => "?").join(", ")})`;
      params.push(...types);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(String(limit));

    try {
      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: string;
        rank: number;
      }>;

      const results: MemorySearchResult[] = [];
      for (const row of rows) {
        const memory = this.getMemory(row.id);
        if (memory) {
          // Convert BM25 rank to score (rank is negative, closer to 0 is better)
          const score = 1 / (1 + Math.abs(row.rank));
          results.push({ memory, score });
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Hybrid search combining vector similarity and keyword matching
   * Uses weighted combination of scores
   */
  async searchHybrid(
    query: string,
    limit: number = 5,
    sessionId?: string,
    types?: MemoryType[],
    options: { vectorWeight?: number; keywordWeight?: number } = {}
  ): Promise<MemorySearchResult[]> {
    const vectorWeight = options.vectorWeight ?? 0.7;
    const keywordWeight = options.keywordWeight ?? 0.3;

    // Get more candidates to merge
    const candidateMultiplier = 4;
    const candidateLimit = limit * candidateMultiplier;

    // Run both searches
    const [vectorResults, keywordResults] = await Promise.all([
      this.search(query, candidateLimit, sessionId, types),
      Promise.resolve(
        this.searchKeyword(query, candidateLimit, sessionId, types)
      ),
    ]);

    // Merge results by memory ID
    const merged = new Map<
      string,
      { vectorScore: number; keywordScore: number }
    >();

    for (const result of vectorResults) {
      merged.set(result.memory.id, {
        vectorScore: result.score,
        keywordScore: 0,
      });
    }

    for (const result of keywordResults) {
      const existing = merged.get(result.memory.id);
      if (existing) {
        existing.keywordScore = result.score;
      } else {
        merged.set(result.memory.id, {
          vectorScore: 0,
          keywordScore: result.score,
        });
      }
    }

    // Calculate final scores and sort
    const finalResults: Array<{ memoryId: string; score: number }> = [];
    for (const [memoryId, scores] of merged) {
      const finalScore =
        vectorWeight * scores.vectorScore + keywordWeight * scores.keywordScore;
      finalResults.push({ memoryId, score: finalScore });
    }

    finalResults.sort((a, b) => b.score - a.score);

    // Load full memory objects for top results
    const results: MemorySearchResult[] = [];
    for (const { memoryId, score } of finalResults.slice(0, limit)) {
      const memory = this.getMemory(memoryId);
      if (memory) {
        results.push({ memory, score });
      }
    }

    return results;
  }

  getMemory(id: string): SemanticMemory | null {
    const row = this.db
      .prepare(
        `SELECT id, session_id, content, type, confidence, created_at, updated_at, metadata
         FROM memories WHERE id = ?`
      )
      .get(id) as
      | {
          id: string;
          session_id: string | null;
          content: string;
          type: string;
          confidence: number;
          created_at: string;
          updated_at: string;
          metadata: string | null;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id ?? undefined,
      content: row.content,
      type: row.type as MemoryType,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  getMemoriesBySession(
    sessionId: string,
    limit: number = 50
  ): SemanticMemory[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, content, type, confidence, created_at, updated_at, metadata
         FROM memories WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(sessionId, limit) as Array<{
      id: string;
      session_id: string | null;
      content: string;
      type: string;
      confidence: number;
      created_at: string;
      updated_at: string;
      metadata: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id ?? undefined,
      content: row.content,
      type: row.type as MemoryType,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  /**
   * Get all memories across all sessions (for global search)
   */
  getAllMemories(limit: number = 100): SemanticMemory[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, content, type, confidence, created_at, updated_at, metadata
         FROM memories
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<{
      id: string;
      session_id: string | null;
      content: string;
      type: string;
      confidence: number;
      created_at: string;
      updated_at: string;
      metadata: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id ?? undefined,
      content: row.content,
      type: row.type as MemoryType,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  updateConfidence(id: string, confidence: number): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE memories SET confidence = ?, updated_at = ? WHERE id = ?`
      )
      .run(confidence, now, id);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    // Delete from FTS if enabled
    if (this.ftsEnabled) {
      try {
        this.db.prepare(`DELETE FROM memories_fts WHERE id = ?`).run(id);
      } catch {
        // FTS delete failed, continue
      }
    }

    // Delete from SQLite (cascades to embeddings)
    const result = this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);

    return result.changes > 0;
  }

  async deduplicate(
    content: string,
    threshold: number = 0.95
  ): Promise<boolean> {
    // Check if similar memory already exists
    const results = await this.search(content, 1);
    if (results.length > 0 && results[0].score >= threshold) {
      return true; // Duplicate found
    }
    return false;
  }

  getStats(): {
    total: number;
    byType: Record<string, number>;
    bySession: Record<string, number>;
    ftsEnabled: boolean;
  } {
    const total = (
      this.db.prepare(`SELECT COUNT(*) as count FROM memories`).get() as {
        count: number;
      }
    ).count;

    const byType: Record<string, number> = {};
    const typeRows = this.db
      .prepare(`SELECT type, COUNT(*) as count FROM memories GROUP BY type`)
      .all() as Array<{ type: string; count: number }>;
    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    const bySession: Record<string, number> = {};
    const sessionRows = this.db
      .prepare(
        `SELECT session_id, COUNT(*) as count FROM memories WHERE session_id IS NOT NULL GROUP BY session_id`
      )
      .all() as Array<{ session_id: string; count: number }>;
    for (const row of sessionRows) {
      bySession[row.session_id] = row.count;
    }

    return { total, byType, bySession, ftsEnabled: this.ftsEnabled };
  }

  close(): void {
    this.db.close();
  }
}

// Global vector store instance
let vectorStore: VectorStore | null = null;

export function initVectorStore(options: VectorStoreOptions): VectorStore {
  if (vectorStore) {
    vectorStore.close();
  }
  vectorStore = new VectorStore(options);
  return vectorStore;
}

export function getVectorStore(): VectorStore | null {
  return vectorStore;
}
