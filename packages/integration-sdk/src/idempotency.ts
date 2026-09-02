import type { ExecuteActionResponse } from './types';

/**
 * Storage interface for caching action execution responses by idempotency key.
 * Allows duplicate requests with the same Idempotency-Key header to return the
 * previously calculated response without re-running business logic.
 */
export interface IdempotencyStore {
  /** Retrieves a cached action response if available. */
  get(key: string): Promise<ExecuteActionResponse | undefined> | ExecuteActionResponse | undefined;

  /** Stores an action response under the specified key with an optional TTL. */
  set(
    key: string,
    value: ExecuteActionResponse,
    ttlSeconds?: number,
  ): Promise<void> | void;

  /** Deletes an entry by key (optional). */
  delete?(key: string): Promise<void> | void;

  /** Clears all entries in the store (useful for testing). */
  clear?(): Promise<void> | void;
}

interface MemoryStoreEntry {
  response: ExecuteActionResponse;
  expiresAt: number;
}

/**
 * In-memory implementation of `IdempotencyStore` with automatic TTL expiration.
 * Suitable for local development, testing, and single-instance deployments.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, MemoryStoreEntry>();
  private readonly defaultTtlSeconds: number;

  constructor(options?: { defaultTtlSeconds?: number }) {
    this.defaultTtlSeconds = options?.defaultTtlSeconds ?? 86400; // 24 hours default
  }

  get(key: string): ExecuteActionResponse | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.response;
  }

  set(key: string, value: ExecuteActionResponse, ttlSeconds?: number): void {
    const ttl = (ttlSeconds ?? this.defaultTtlSeconds) * 1000;
    this.store.set(key, {
      response: value,
      expiresAt: Date.now() + ttl,
    });

    // Lazy cleanup of expired entries if store gets large
    if (this.store.size > 1000) {
      this.cleanup();
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
