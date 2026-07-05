import type { StoreBackend, SyncKVStore } from "./types";

// ---------------------------------------------------------------------------
// KV store singleton
// ---------------------------------------------------------------------------

let kvStore: SyncKVStore | null = null;

/** Return the global KV store. Lazily created on first access. */
export function getKVStore(): SyncKVStore {
  if (!kvStore) {
    kvStore = createKVStore();
  }
  return kvStore;
}

/**
 * Override the global KV store (test injection, app bootstrap).
 * Pass `null` to reset – the next call to `getKVStore()` will create a
 * new default.
 */
export function setKVStore(store: SyncKVStore | null): void {
  kvStore = store;
}

/**
 * Reset the KV store singleton.
 * Convenience alias – next `getKVStore()` call creates a fresh store.
 */
export function resetKVStore(): void {
  kvStore = null;
}

function createKVStore(): SyncKVStore {
  // In production, initCoderStorageSync() registers the HTTP KV store
  // backed by ~/.coder/settings.json. This in-memory fallback is for
  // unit tests and environments before bootstrap.
  return createMemoryKVStore();
}

/** In-memory KV store for unit tests and pre-bootstrap environments. */
export function createMemoryKVStore(): SyncKVStore {
  const map = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Store backend singleton
// ---------------------------------------------------------------------------

let storeBackend: StoreBackend | null = null;

/** Return the global store backend. Returns `null` if none has been set. */
export function getStoreBackend(): StoreBackend | null {
  return storeBackend;
}

/** Return the global store backend, throwing if unset. */
export function requireStoreBackend(): StoreBackend {
  if (!storeBackend) {
    throw new Error(
      "No store backend configured. Call initCoderStorageSync() before accessing the store.",
    );
  }
  return storeBackend;
}

/** Override the store backend (test injection, app bootstrap). */
export function setStoreBackend(backend: StoreBackend | null): void {
  storeBackend = backend;
}

/** Reset the store backend singleton. Used in tests to isolate state. */
export function resetStoreBackend(): void {
  storeBackend = null;
}
