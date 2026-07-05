/**
 * Synchronous key–value store for user settings.
 *
 * Production: backed by ~/.coder/settings.json via the HTTP KV adapter.
 * Tests: in-memory implementation via createMemoryKVStore().
 */
export interface SyncKVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ---------------------------------------------------------------------------
// Document store backend (async, for structured entities)
// ---------------------------------------------------------------------------

/**
 * Low-level storage backend used by `src/lib/db/`.
 * Each method takes a store name (table) as its first parameter so a single
 * backend instance can serve all stores.
 *
 * Production: SQLite via HTTP `/db/*` endpoints on the Rust backend.
 */
export interface StoreBackend {
  /** Retrieve a single record by primary key. */
  get<T>(storeName: string, key: string): Promise<T | undefined>;

  /** Return every record in the store. */
  getAll<T>(storeName: string): Promise<T[]>;

  /** Insert or overwrite a record. */
  put<T>(storeName: string, value: T): Promise<void>;

  /** Delete a record by primary key. */
  delete(storeName: string, key: string): Promise<void>;

  /**
   * Query records by a named index with an optional filter value.
   *
   * - `getAllFromIndex("sessions", "by-updatedAt")` → all sessions,
   *   ordered by the index.
   * - `getAllFromIndex("messages", "by-sessionId", "abc")` → messages
   *   whose sessionId equals "abc".
   */
  getAllFromIndex<T>(
    storeName: string,
    indexName: string,
    value?: unknown,
  ): Promise<T[]>;

  /** Count records in a store. */
  count(storeName: string): Promise<number>;

  /** Delete every record in a store. */
  clear(storeName: string): Promise<void>;
}
