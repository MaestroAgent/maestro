import { EmbeddingProvider } from "./types.js";

// Simple in-memory cache for embeddings
const embeddingCache = new Map<string, number[]>();

export class AnthropicEmbeddingProvider implements EmbeddingProvider {
  private model: string;
  private dimensions: number;

  constructor(model: string = "voyage-3-large") {
    this.model = model;
    // voyage-3-large has 1024 dimensions
    this.dimensions = model.includes("large") ? 1024 : 512;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache first
    for (let i = 0; i < texts.length; i++) {
      const cacheKey = `${this.model}:${texts[i]}`;
      const cached = embeddingCache.get(cacheKey);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    // Fetch uncached embeddings
    if (uncachedTexts.length > 0) {
      // For now, use a simple hash-based pseudo-embedding
      // In production, you would use the Anthropic/Voyage API
      for (let i = 0; i < uncachedTexts.length; i++) {
        const text = uncachedTexts[i];
        const embedding = this.hashToEmbedding(text);
        const cacheKey = `${this.model}:${text}`;
        embeddingCache.set(cacheKey, embedding);
        results[uncachedIndices[i]] = embedding;
      }
    }

    return results;
  }

  // Simple hash-based embedding for development
  // Replace with actual API call for production
  private hashToEmbedding(text: string): number[] {
    const embedding = new Array(this.dimensions).fill(0);

    // Simple hash-based initialization
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = (charCode + i * 7) % this.dimensions;
      embedding[index] += Math.sin(charCode * 0.01) * 0.1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
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
    return this.model;
  }
}

// Factory function to get the default embedding provider
export function createEmbeddingProvider(): EmbeddingProvider {
  return new AnthropicEmbeddingProvider();
}
