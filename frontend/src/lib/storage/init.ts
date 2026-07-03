import {
  setStoreBackend,
  getStoreBackend,
  setKVStore,
  getTauriFsKvStore,
  TauriSqliteBackend,
} from "@/lib/storage";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let migrationDone = false;

/**
 * Initialize the `~/.coder/` storage backends.
 *
 * **Phase 1 (synchronous):** swapped at module level so the very first
 * component render already sees the file-backed stores.
 *
 * **Phase 2 (asynchronous):** warms up the SQLite database.  Called from
 * `useEffect` so it does not block rendering.
 */
export function initCoderStorageSync(): void {
  if (migrationDone) return;
  migrationDone = true;

  // Switch KV store to file-system backed settings.json
  setKVStore(getTauriFsKvStore());

  // Create and register the SQLite backend
  const sqlite = new TauriSqliteBackend();
  setStoreBackend(sqlite);
}

/** Resolves once both backends are fully initialized. */
export function onStorageReady(): Promise<void> {
  const kv = getTauriFsKvStore();
  return kv.ready();
}

export async function initCoderStorageAsync(): Promise<void> {
  const backend = getStoreBackend();
  if (backend instanceof TauriSqliteBackend) {
    await backend.warmup();
  }
}
