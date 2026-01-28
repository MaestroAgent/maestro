import faissNode from "faiss-node";
const { IndexFlatL2 } = faissNode;
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { EmbeddingProvider, SemanticMemory, MemorySearchResult, MemoryType } from "./types.js";
import { createEmbeddingProvider } from "./embeddings.js";

export interface VectorStoreOptions {
  dbPath: string;
  embeddingProvider?: EmbeddingProvider;
}

export class VectorStore {
  private db: Database.Database;
  private index: InstanceType<typeof IndexFlatL2>;
  private embedder: EmbeddingProvider;
  private idMap: Map<number, string> = new Map(); // FAISS index -> memory ID
  private nextFaissId: number = 0;

  constructor(options: VectorStoreOptions) {
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.embedder = options.embeddingProvider ?? createEmbeddingProvider();

    this.initSchema();
    this.index = new IndexFlatL2(this.embedder.getDimensions());
    this.loadIndex();
  }

  private initSchema(): void {
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
        faiss_id INTEGER NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memories_session
        ON memories(session_id);

      CREATE INDEX IF NOT EXISTS idx_memories_type
        ON memories(type);

      CREATE INDEX IF NOT EXISTS idx_memory_embeddings_faiss
        ON memory_embeddings(faiss_id);
    `);
  }

  private loadIndex(): void {
    // Load all existing embeddings into FAISS index
    const rows = this.db
      .prepare(
        `SELECT me.faiss_id, me.embedding, me.memory_id
         FROM memory_embeddings me
         ORDER BY me.faiss_id`
      )
      .all() as Array<{ faiss_id: number; embedding: Buffer; memory_id: string }>;

    for (const row of rows) {
      const embedding = Array.from(new Float32Array(row.embedding.buffer));
      this.index.add(embedding);
      this.idMap.set(row.faiss_id, row.memory_id);
      this.nextFaissId = Math.max(this.nextFaissId, row.faiss_id + 1);
    }
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

    // Store in SQLite
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

    // Store embedding
    const faissId = this.nextFaissId++;
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    this.db
      .prepare(
        `INSERT INTO memory_embeddings (memory_id, embedding, model, faiss_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, embeddingBuffer, this.embedder.getModelName(), faissId);

    // Add to FAISS index
    this.index.add(embedding);
    this.idMap.set(faissId, id);

    return id;
  }

  async search(
    query: string,
    limit: number = 5,
    sessionId?: string,
    types?: MemoryType[]
  ): Promise<MemorySearchResult[]> {
    if (this.index.ntotal() === 0) {
      return [];
    }

    // Generate query embedding
    const embeddings = await this.embedder.embed([query]);
    const queryEmbedding = embeddings[0];

    // Search FAISS - get more results than needed to allow filtering
    const searchLimit = Math.min(limit * 3, this.index.ntotal());
    const { labels, distances } = this.index.search(
      queryEmbedding,
      searchLimit
    );

    // Get memory IDs from FAISS results
    const results: MemorySearchResult[] = [];

    for (let i = 0; i < labels.length && results.length < limit; i++) {
      const faissId = labels[i];
      if (faissId === -1) continue;

      const memoryId = this.idMap.get(faissId);
      if (!memoryId) continue;

      // Load memory from DB
      const memory = this.getMemory(memoryId);
      if (!memory) continue;

      // Apply filters
      if (sessionId && memory.sessionId && memory.sessionId !== sessionId) {
        continue;
      }
      if (types && types.length > 0 && !types.includes(memory.type)) {
        continue;
      }

      // Convert L2 distance to similarity score (0-1)
      const score = 1 / (1 + distances[i]);

      results.push({ memory, score });
    }

    return results;
  }

  getMemory(id: string): SemanticMemory | null {
    const row = this.db
      .prepare(
        `SELECT id, session_id, content, type, confidence, created_at, updated_at, metadata
         FROM memories WHERE id = ?`
      )
      .get(id) as {
        id: string;
        session_id: string | null;
        content: string;
        type: string;
        confidence: number;
        created_at: string;
        updated_at: string;
        metadata: string | null;
      } | undefined;

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

  getMemoriesBySession(sessionId: string, limit: number = 50): SemanticMemory[] {
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

  updateConfidence(id: string, confidence: number): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(`UPDATE memories SET confidence = ?, updated_at = ? WHERE id = ?`)
      .run(confidence, now, id);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    // Find the FAISS ID first
    const embRow = this.db
      .prepare(`SELECT faiss_id FROM memory_embeddings WHERE memory_id = ?`)
      .get(id) as { faiss_id: number } | undefined;

    // Delete from SQLite (cascades to embeddings)
    const result = this.db
      .prepare(`DELETE FROM memories WHERE id = ?`)
      .run(id);

    if (result.changes > 0 && embRow) {
      // Remove from ID map (can't remove from FAISS without rebuilding)
      this.idMap.delete(embRow.faiss_id);
    }

    return result.changes > 0;
  }

  async deduplicate(content: string, threshold: number = 0.95): Promise<boolean> {
    // Check if similar memory already exists
    const results = await this.search(content, 1);
    if (results.length > 0 && results[0].score >= threshold) {
      return true; // Duplicate found
    }
    return false;
  }

  getStats(): { total: number; byType: Record<string, number>; bySession: Record<string, number> } {
    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM memories`).get() as { count: number }).count;

    const byType: Record<string, number> = {};
    const typeRows = this.db
      .prepare(`SELECT type, COUNT(*) as count FROM memories GROUP BY type`)
      .all() as Array<{ type: string; count: number }>;
    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    const bySession: Record<string, number> = {};
    const sessionRows = this.db
      .prepare(`SELECT session_id, COUNT(*) as count FROM memories WHERE session_id IS NOT NULL GROUP BY session_id`)
      .all() as Array<{ session_id: string; count: number }>;
    for (const row of sessionRows) {
      bySession[row.session_id] = row.count;
    }

    return { total, byType, bySession };
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
