import { createHash, randomBytes, timingSafeEqual } from "crypto";

const KEY_PREFIX = "msk_";
const KEY_LENGTH = 32; // 32 bytes = 64 hex chars

export interface GeneratedKey {
  key: string;
  keyHash: string;
  keyPrefix: string;
}

/**
 * Timing-safe comparison of two strings
 * Prevents timing attacks on sensitive comparisons
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time even when lengths differ
    const dummy = Buffer.alloc(a.length);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Generate a new API key with hash and prefix
 * Format: msk_<64 hex chars> (68 chars total)
 */
export function generateApiKey(): GeneratedKey {
  const randomPart = randomBytes(KEY_LENGTH).toString("hex");
  const key = `${KEY_PREFIX}${randomPart}`;
  const keyHash = hashApiKey(key);
  const keyPrefix = key.slice(0, 12); // msk_ + first 8 hex chars

  return { key, keyHash, keyPrefix };
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Extract bearer token from Authorization header
 * Returns null if header is missing or invalid
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  return parts[1];
}

/**
 * Validate API key format
 * Format: msk_<64 hex chars>
 */
export function isValidKeyFormat(key: string): boolean {
  if (!key.startsWith(KEY_PREFIX)) {
    return false;
  }

  const randomPart = key.slice(KEY_PREFIX.length);
  if (randomPart.length !== KEY_LENGTH * 2) {
    return false;
  }

  return /^[a-f0-9]+$/i.test(randomPart);
}
