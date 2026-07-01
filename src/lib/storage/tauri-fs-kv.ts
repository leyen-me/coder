import {
  mkdir,
  readTextFile,
  writeTextFile,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";

import type { SyncKVStore } from "./types";

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

// ---------------------------------------------------------------------------
// Tauri filesystem-backed KV store
// ---------------------------------------------------------------------------

const RELATIVE_PATH = ".coder/settings.json";

/**
 * Synchronous KV store backed by `~/.coder/settings.json`.
 *
 * - Reads the full JSON file into memory on first access.
 * - `getItem` / `setItem` / `removeItem` operate on the in-memory map
 *   synchronously.
 * - Mutations schedule a debounced (500 ms) async write-back to disk.
 * - If the file does not exist (first run), an empty store is assumed.
 */
export class TauriFsKvStore implements SyncKVStore {
  private data: Map<string, string> | null = null;
  private initPromise: Promise<void> | null = null;
  private dirty = false;

  private readonly flush = debounce(() => {
    this.flushSync().catch(() => {
      // File write failures are logged but never thrown – the in-memory
      // state is the source of truth until the next successful write.
    });
  }, 500);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  getItem(key: string): string | null {
    void this.ensureLoaded();
    return this.data?.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    void this.ensureLoaded();
    if (!this.data) {
      this.data = new Map();
    }
    this.data.set(key, value);
    this.dirty = true;
    this.flush();
  }

  removeItem(key: string): void {
    void this.ensureLoaded();
    this.data?.delete(key);
    this.dirty = true;
    this.flush();
  }

  /** Force-flush pending changes to disk.  Useful before app shutdown. */
  async flushNow(): Promise<void> {
    if (!this.dirty) return;
    await this.flushSync();
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async ensureLoaded(): Promise<void> {
    if (this.data) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = this.loadFromDisk();
    await this.initPromise;
  }

  private async loadFromDisk(): Promise<void> {
    this.data = new Map();

    try {
      const raw = await readTextFile(RELATIVE_PATH, {
        baseDir: BaseDirectory.Home,
      });
      if (raw) {
        const parsed: Record<string, string> = JSON.parse(raw);
        for (const [key, value] of Object.entries(parsed)) {
          this.data.set(key, String(value));
        }
      }
    } catch {
      // File does not exist yet – start with an empty store.
    }
  }

  private async flushSync(): Promise<void> {
    if (!this.dirty || !this.data) return;

    try {
      await mkdir(".coder", {
        baseDir: BaseDirectory.Home,
        recursive: true,
      });
    } catch {
      // Directory may already exist.
    }

    const obj: Record<string, string> = {};
    for (const [key, value] of this.data) {
      obj[key] = value;
    }

    try {
      await writeTextFile(RELATIVE_PATH, JSON.stringify(obj, null, 2), {
        baseDir: BaseDirectory.Home,
      });
      this.dirty = false;
    } catch (err) {
      console.error("[TauriFsKvStore] Failed to write settings file:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let instance: TauriFsKvStore | null = null;

/** Get or create the singleton Tauri-filesystem KV store. */
export function getTauriFsKvStore(): TauriFsKvStore {
  if (!instance) {
    instance = new TauriFsKvStore();
  }
  return instance;
}
