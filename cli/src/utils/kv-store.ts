/**
 * File-based KV store for CLI.
 * Replaces the browser's localStorage / Tauri's KV store.
 * Uses a simple JSON file in the config directory.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export type SyncKVStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function createFileKVStore(configDir: string): SyncKVStore {
  const storePath = join(configDir, "kv-store.json");

  function ensureDir(): void {
    const dir = dirname(storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  function readAll(): Record<string, string> {
    if (!existsSync(storePath)) {
      return {};
    }
    try {
      const raw = readFileSync(storePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function writeAll(data: Record<string, string>): void {
    ensureDir();
    writeFileSync(storePath, JSON.stringify(data, null, 2), "utf-8");
  }

  return {
    getItem(key: string): string | null {
      const data = readAll();
      return data[key] ?? null;
    },
    setItem(key: string, value: string): void {
      const data = readAll();
      data[key] = value;
      writeAll(data);
    },
    removeItem(key: string): void {
      const data = readAll();
      delete data[key];
      writeAll(data);
    },
  };
}
