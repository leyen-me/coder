// HTTP-based KV store for Coder Server mode.
// All settings are stored in ~/.coder/settings.json on the Rust side.
// The store preloads all settings on construction and writes back via HTTP.

import { apiGet, apiPost } from "@/lib/api/client";
import type { SyncKVStore } from "./types";

export function createHttpKvStore(): SyncKVStore & { ready: () => Promise<void> } {
  const cache = new Map<string, string>();
  let readyPromise: Promise<void> | null = null;

  async function load(): Promise<void> {
    try {
      const settings = await apiGet<Record<string, string>>("/settings/get");
      for (const [key, value] of Object.entries(settings)) {
        cache.set(key, String(value));
      }
    } catch {
      // Backend not available yet — start with empty cache.
    }
  }

  return {
    getItem(key: string): string | null {
      return cache.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      cache.set(key, value);
      // Fire-and-forget write-back
      apiPost("/settings/set", { key, value }).catch(() => {});
    },

    removeItem(key: string): void {
      cache.delete(key);
      // Fire-and-forget delete
      apiPost("/settings/delete", { key }).catch(() => {});
    },

    ready(): Promise<void> {
      if (!readyPromise) {
        readyPromise = load();
      }
      return readyPromise;
    },
  };
}
