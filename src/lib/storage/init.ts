import { isTauri } from "@tauri-apps/api/core";
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

  console.log("[storage-init] Swapping backends (sync)...");

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
  console.log("[storage-init] Warming up SQLite backend (async)...");
  const backend = getStoreBackend();
  if (backend instanceof TauriSqliteBackend) {
    await backend.warmup();
  }
  console.log("[storage-init] SQLite backend ready.");
}

// Phase 1 runs immediately when this module is first imported,
// before any React component renders.  Only in Tauri – browser dev
// mode still uses IndexedDB / localStorage.
if (isTauri()) {
  initCoderStorageSync();
  // Top-level await – blocks module evaluation (and thus React rendering)
  // until the settings file has been fully loaded from disk.
  await onStorageReady();
}
