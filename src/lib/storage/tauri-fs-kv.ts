import { homeDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

import type { SyncKVStore } from "./types";

/**
 * Synchronous KV store backed by `~/.coder/settings.json`.
 *
 * Uses Tauri IPC commands (`read_text_file`, `write_text_file`, `ensure_dir`)
 * instead of `@tauri-apps/plugin-fs` to avoid scope/permission issues with
 * accessing the user's home directory.
 *
 * Every `setItem` / `removeItem` writes to disk immediately (no debounce).
 */
export class TauriFsKvStore implements SyncKVStore {
  private data: Map<string, string> | null = null;
  private initPromise: Promise<void> | null = null;
  private filePath: string = "";
  private dirty = false;

  constructor() {
    this.initPromise = this.init();
  }

  async ready(): Promise<void> {
    await this.initPromise;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  getItem(key: string): string | null {
    void this.ensureLoaded();
    return this.data?.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    void this.ensureLoaded();
    if (!this.data) this.data = new Map();
    this.data.set(key, value);
    this.dirty = true;
    void this.flushSync();
  }

  removeItem(key: string): void {
    void this.ensureLoaded();
    this.data?.delete(key);
    this.dirty = true;
    void this.flushSync();
  }

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
    this.initPromise = this.init();
    await this.initPromise;
  }

  private async init(): Promise<void> {
    const home = await homeDir();
    this.filePath = await join(home, ".coder", "settings.json");

    const dir = await join(home, ".coder");
    try {
      await invoke("ensure_dir", { targetPath: dir });
    } catch {
      // ignore
    }

    try {
      const raw = await invoke<string>("read_text_file", {
        targetPath: this.filePath,
      });
      if (raw) {
        const parsed: Record<string, string> = JSON.parse(raw);
        this.data = new Map(Object.entries(parsed));
      }
    } catch {
      this.data = new Map();
    }
  }

  private async flushSync(): Promise<void> {
    if (!this.dirty || !this.data) return;

    const obj: Record<string, string> = {};
    for (const [key, value] of this.data) {
      obj[key] = value;
    }

    try {
      await invoke("write_text_file", {
        targetPath: this.filePath,
        content: JSON.stringify(obj, null, 2),
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

export function getTauriFsKvStore(): TauriFsKvStore {
  if (!instance) {
    instance = new TauriFsKvStore();
  }
  return instance;
}
