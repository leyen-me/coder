import { HttpStoreBackend } from "./http-backend";
import { createHttpKvStore } from "./http-kv";
import {
  setStoreBackend,
  setKVStore,
  getKVStore,
} from "@/lib/storage";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let migrationDone = false;

/**
 * Initialize the HTTP storage backend and KV store.
 * Both talk to the Rust backend (SQLite for entities, settings.json for KV).
 * Called synchronously at app startup.
 */
export function initCoderStorageSync(): void {
  if (migrationDone) return;
  migrationDone = true;

  // Settings KV → Rust ~/.coder/settings.json
  const kv = createHttpKvStore();
  setKVStore(kv);

  // Entity store → Rust SQLite via /db/* endpoints
  const httpBackend = new HttpStoreBackend();
  setStoreBackend(httpBackend);
}

/** Resolves once the KV store has loaded its initial data from the backend. */
export function onStorageReady(): Promise<void> {
  const store = getKVStore() as { ready?: () => Promise<void> };
  if (typeof store?.ready === "function") {
    return store.ready();
  }
  return Promise.resolve();
}

export async function initCoderStorageAsync(): Promise<void> {
  // Preload settings from the backend
  await onStorageReady();

  // Notify components that storage data has been loaded
  // so they can re-read from the now-populated cache.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("coder:storage-ready"));
  }
}
