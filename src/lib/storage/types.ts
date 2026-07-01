/**
 * Synchronous key–value store.
 *
 * Its shape matches the native `Storage` interface (`localStorage`),
 * so the browser KV adapter delegates directly to `localStorage`
 * without a wrapper.  The Node.js adapter will read / write a JSON
 * settings file under `~/.coder/`.
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
 * Low-level storage backend that mirrors the IndexedDB operations used by
 * `src/lib/db/`.  Each method takes a store name (table / object store)
 * as its first parameter so a single backend instance can serve all stores.
 *
 * Browser:  delegates to `idb` (IndexedDB).
 * Node/CLI: delegates to better-sqlite3.
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
   *   ordered by the index (default IndexedDB behaviour).
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
