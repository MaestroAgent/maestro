import { createHash } from "crypto";
import { EmbeddingProvider } from "./types.js";

// Configuration for embedding providers
export interface EmbeddingConfig {
  provider?: "openai" | "voyage" | "auto";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  fallback?: "openai" | "voyage" | "none";
}

// Result from creating an embedding provider
export interface EmbeddingProviderResult {
  provider: EmbeddingProvider;
  requestedProvider: "openai" | "voyage" | "auto";
  fallbackFrom?: "openai" | "voyage";
  fallbackReason?: string;
}

// Default models and dimensions
const OPENAI_DEFAULT_MODEL = "text-embedding-3-small";
const OPENAI_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

const VOYAGE_DEFAULT_MODEL = "voyage-3-lite";
const VOYAGE_DIMENSIONS: Record<string, number> = {
  "voyage-3-large": 1024,
  "voyage-3": 1024,
  "voyage-3-lite": 512,
  "voyage-code-3": 1024,
};

/**
 * OpenAI Embedding Provider
 * Uses the OpenAI embeddings API for semantic search
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private model: string;
  private dimensions: number;
  private apiKey: string;
  private baseUrl: string;

  constructor(
    config: { model?: string; apiKey?: string; baseUrl?: string } = {}
  ) {
    this.model = config.model || OPENAI_DEFAULT_MODEL;
    this.dimensions = OPENAI_DIMENSIONS[this.model] || 1536;
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";

    if (!this.apiKey) {
      throw new Error(
        "No API key found for provider: openai. Set OPENAI_API_KEY environment variable."
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `${this.baseUrl.replace(/\/$/, "")}/embeddings`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI embeddings failed: ${response.status} ${text}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return (payload.data ?? []).map((entry) => entry.embedding ?? []);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModelName(): string {
    return `openai/${this.model}`;
  }
}

/**
 * Voyage AI Embedding Provider
 * Recommended embedding provider for Anthropic ecosystem
 */
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  private model: string;
  private dimensions: number;
  private apiKey: string;
  private baseUrl: string;

  constructor(
    config: { model?: string; apiKey?: string; baseUrl?: string } = {}
  ) {
    this.model = config.model || VOYAGE_DEFAULT_MODEL;
    this.dimensions = VOYAGE_DIMENSIONS[this.model] || 1024;
    this.apiKey = config.apiKey || process.env.VOYAGE_API_KEY || "";
    this.baseUrl = config.baseUrl || "https://api.voyageai.com/v1";

    if (!this.apiKey) {
      throw new Error(
        "No API key found for provider: voyage. Set VOYAGE_API_KEY environment variable."
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `${this.baseUrl.replace(/\/$/, "")}/embeddings`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: "document",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Voyage embeddings failed: ${response.status} ${text}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return (payload.data ?? []).map((entry) => entry.embedding ?? []);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModelName(): string {
    return `voyage/${this.model}`;
  }
}

/**
 * Hash-based fallback provider for development/testing
 * Not suitable for production - use real embeddings instead
 */
export class HashEmbeddingProvider implements EmbeddingProvider {
  private dimensions: number;

  constructor(dimensions: number = 512) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.hashToEmbedding(text));
  }

  private hashToEmbedding(text: string): number[] {
    const embedding = new Array(this.dimensions).fill(0);

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = (charCode + i * 7) % this.dimensions;
      embedding[index] += Math.sin(charCode * 0.01) * 0.1;
    }

    // Normalize
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModelName(): string {
    return "hash-fallback";
  }
}

function isMissingApiKeyError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes("No API key found for provider");
  }
  return false;
}

/**
 * Creates an embedding provider with auto-selection and fallback
 *
 * Priority order for "auto":
 * 1. OpenAI (if OPENAI_API_KEY is set)
 * 2. Voyage (if VOYAGE_API_KEY is set)
 * 3. Hash fallback (for development only)
 */
export async function createEmbeddingProvider(
  config: EmbeddingConfig = {}
): Promise<EmbeddingProviderResult> {
  const requestedProvider = config.provider || "auto";
  const fallback = config.fallback || "none";

  const createProvider = (id: "openai" | "voyage"): EmbeddingProvider => {
    if (id === "openai") {
      return new OpenAIEmbeddingProvider({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    }
    return new VoyageEmbeddingProvider({
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  };

  // Auto-select provider
  if (requestedProvider === "auto") {
    const missingKeyErrors: string[] = [];

    // Try OpenAI first
    try {
      const provider = createProvider("openai");
      return { provider, requestedProvider };
    } catch (err) {
      if (isMissingApiKeyError(err)) {
        missingKeyErrors.push(err instanceof Error ? err.message : String(err));
      } else {
        throw err;
      }
    }

    // Try Voyage second
    try {
      const provider = createProvider("voyage");
      return { provider, requestedProvider };
    } catch (err) {
      if (isMissingApiKeyError(err)) {
        missingKeyErrors.push(err instanceof Error ? err.message : String(err));
      } else {
        throw err;
      }
    }

    // Fall back to hash-based embeddings (development only)
    console.warn(
      "[memory] No embedding API keys found. Using hash-based fallback (not suitable for production).\n" +
        "Set OPENAI_API_KEY or VOYAGE_API_KEY for real semantic search."
    );
    return {
      provider: new HashEmbeddingProvider(),
      requestedProvider,
      fallbackFrom: "openai",
      fallbackReason: missingKeyErrors.join("\n"),
    };
  }

  // Explicit provider selection
  try {
    const provider = createProvider(requestedProvider);
    return { provider, requestedProvider };
  } catch (primaryErr) {
    const reason =
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // Try fallback if configured
    if (fallback !== "none" && fallback !== requestedProvider) {
      try {
        const provider = createProvider(fallback);
        return {
          provider,
          requestedProvider,
          fallbackFrom: requestedProvider,
          fallbackReason: reason,
        };
      } catch (fallbackErr) {
        const fallbackReason =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        throw new Error(
          `${reason}\n\nFallback to ${fallback} failed: ${fallbackReason}`
        );
      }
    }

    throw new Error(reason);
  }
}

/**
 * Cached embedding provider that wraps another provider
 * Uses SQLite-backed cache with LRU eviction
 */
export class CachedEmbeddingProvider implements EmbeddingProvider {
  private inner: EmbeddingProvider;
  private cache: Map<string, number[]>;
  private maxCacheSize: number;
  private accessOrder: string[];
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor(inner: EmbeddingProvider, maxCacheSize: number = 10000) {
    this.inner = inner;
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.accessOrder = [];
  }

  private getCacheKey(text: string): string {
    // Use provider + model + content hash as cache key
    const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
    return `${this.inner.getModelName()}:${hash}`;
  }

  private evictIfNeeded(): void {
    while (
      this.cache.size >= this.maxCacheSize &&
      this.accessOrder.length > 0
    ) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }
  }

  private markAccessed(key: string): void {
    // Move to end of access order (most recently used)
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: (number[] | null)[] = new Array(texts.length).fill(null);
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache first
    for (let i = 0; i < texts.length; i++) {
      const key = this.getCacheKey(texts[i]);
      const cached = this.cache.get(key);
      if (cached) {
        results[i] = cached;
        this.markAccessed(key);
        this.cacheHits++;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
        this.cacheMisses++;
      }
    }

    // Fetch uncached embeddings
    if (uncachedTexts.length > 0) {
      const embeddings = await this.inner.embed(uncachedTexts);

      for (let i = 0; i < uncachedTexts.length; i++) {
        const key = this.getCacheKey(uncachedTexts[i]);
        const embedding = embeddings[i];

        // Add to cache with LRU eviction
        this.evictIfNeeded();
        this.cache.set(key, embedding);
        this.accessOrder.push(key);

        results[uncachedIndices[i]] = embedding;
      }
    }

    return results as number[][];
  }

  getDimensions(): number {
    return this.inner.getDimensions();
  }

  getModelName(): string {
    return `cached:${this.inner.getModelName()}`;
  }

  getCacheStats(): {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

// Legacy factory function for backwards compatibility
let defaultProvider: EmbeddingProvider | null = null;

export function getDefaultEmbeddingProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    let baseProvider: EmbeddingProvider;

    // Try to create a real provider, fall back to hash if no API keys
    if (process.env.OPENAI_API_KEY) {
      baseProvider = new OpenAIEmbeddingProvider();
    } else if (process.env.VOYAGE_API_KEY) {
      baseProvider = new VoyageEmbeddingProvider();
    } else {
      console.warn(
        "[memory] No embedding API keys found. Using hash-based fallback.\n" +
          "Set OPENAI_API_KEY or VOYAGE_API_KEY for real semantic search."
      );
      baseProvider = new HashEmbeddingProvider();
    }

    // Wrap in cache
    defaultProvider = new CachedEmbeddingProvider(baseProvider);
  }
  return defaultProvider;
}
