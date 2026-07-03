// HTTP-based KV store for Coder Server mode.
// All settings are stored in ~/.coder/settings.json on the Rust side.
// Uses localStorage as a synchronous cache so reads work immediately
// on page load. Backend data overrides the cache once loaded.

import { apiGet, apiPost } from "@/lib/api/client";
import type { SyncKVStore } from "./types";

export function createHttpKvStore(): SyncKVStore & { ready: () => Promise<void> } {
  const cache = new Map<string, string>();
  let readyPromise: Promise<void> | null = null;

  // Seed cache from localStorage so reads are instant on first render
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value !== null) cache.set(key, value);
    }
  }

  async function load(): Promise<void> {
    try {
      const settings = await apiGet<Record<string, string>>("/settings/get");
      for (const [key, value] of Object.entries(settings)) {
        cache.set(key, String(value));
        localStorage.setItem(key, String(value));
      }
    } catch {
      // Backend not available yet — use localStorage cache.
    }
  }

  return {
    getItem(key: string): string | null {
      return cache.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      cache.set(key, value);
      localStorage.setItem(key, value);
      // Fire-and-forget write-back to backend
      apiPost("/settings/set", { key, value }).catch(() => {});
    },

    removeItem(key: string): void {
      cache.delete(key);
      localStorage.removeItem(key);
      // Fire-and-forget delete on backend
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
