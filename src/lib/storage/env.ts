import type { StoreBackend, SyncKVStore } from "./types";

// ---------------------------------------------------------------------------
// KV store singleton
// ---------------------------------------------------------------------------

let kvStore: SyncKVStore | null = null;

/** Return the global KV store.  Lazily created on first access. */
export function getKVStore(): SyncKVStore {
  if (!kvStore) {
    kvStore = createKVStore();
  }
  return kvStore;
}

/**
 * Override the global KV store (test injection, CLI bootstrap).
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
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }

  // Fallback for SSR, test runners, or Node.js (before a proper
  // filesystem KV adapter is registered).
  return createMemoryKVStore();
}

/** Simple in-memory store for environments without `localStorage`. */
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

/** Return the global store backend.  Returns `null` if none has been set. */
export function getStoreBackend(): StoreBackend | null {
  return storeBackend;
}

/** Return the global store backend, throwing if unset. */
export function requireStoreBackend(): StoreBackend {
  if (!storeBackend) {
    throw new Error(
      "No store backend configured. " +
        "In the browser, import and call createBrowserStoreBackend() " +
        "before accessing the store. " +
        "In Node.js / CLI, register a filesystem backend via setStoreBackend().",
    );
  }
  return storeBackend;
}

/** Override the store backend (test injection, CLI bootstrap). */
export function setStoreBackend(backend: StoreBackend | null): void {
  storeBackend = backend;
}

/** Reset the store backend singleton – the next `getStoreBackend()` call
 *  creates a fresh default.  Used in tests to isolate state. */
export function resetStoreBackend(): void {
  storeBackend = null;
}
