import { HttpStoreBackend } from "./http-backend";
import {
  setStoreBackend,
  getStoreBackend,
} from "@/lib/storage";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let migrationDone = false;

/**
 * Initialize the HTTP storage backend that talks to the Rust backend's SQLite.
 * Called synchronously at app startup so the very first render sees a ready store.
 */
export function initCoderStorageSync(): void {
  if (migrationDone) return;
  migrationDone = true;

  // Register the HTTP store backend (talks to Rust SQLite via /db/* endpoints)
  const httpBackend = new HttpStoreBackend();
  setStoreBackend(httpBackend);
}

/** Resolves once the backend is fully initialized. */
export function onStorageReady(): Promise<void> {
  return Promise.resolve();
}

export async function initCoderStorageAsync(): Promise<void> {
  // The HTTP backend is stateless from the client's perspective —
  // no warmup needed.
}
