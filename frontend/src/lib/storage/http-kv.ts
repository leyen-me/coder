// HTTP-based KV store for Coder Server mode.
// All settings are stored in ~/.coder/settings.json on the Rust side.
// Reads are served from an in-memory cache that's populated from the backend
// on first call to ready(). Writes go to the backend immediately.

import { apiGet, apiPost } from "@/lib/api/client";
import type { SyncKVStore } from "./types";

export function createHttpKvStore(): SyncKVStore & { ready: () => Promise<void> } {
  const cache = new Map<string, string>();
  let readyPromise: Promise<void> | null = null;

  async function load(): Promise<void> {
    try {
      const settings = await apiGet<Record<string, string>>("/api/settings/get");
      for (const [key, value] of Object.entries(settings)) {
        cache.set(key, String(value));
      }
    } catch {
      // Backend not available yet — cache stays empty.
    }
  }

  return {
    getItem(key: string): string | null {
      return cache.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      const previous = cache.has(key) ? cache.get(key)! : null;
      cache.set(key, value);
      void apiPost("/api/settings/set", { key, value }).catch((error: unknown) => {
        if (previous === null) {
          cache.delete(key);
        } else {
          cache.set(key, previous);
        }
        console.error("[http-kv] Failed to persist setting:", key, error);
      });
    },

    removeItem(key: string): void {
      const previous = cache.has(key) ? cache.get(key)! : null;
      cache.delete(key);
      void apiPost("/api/settings/delete", { key }).catch((error: unknown) => {
        if (previous !== null) {
          cache.set(key, previous);
        }
        console.error("[http-kv] Failed to delete setting:", key, error);
      });
    },

    ready(): Promise<void> {
      if (!readyPromise) {
        readyPromise = load();
      }
      return readyPromise;
    },
  };
}
