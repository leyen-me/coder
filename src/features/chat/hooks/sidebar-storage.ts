import { getKVStore } from "@/lib/storage";

export const SIDEBAR_STORAGE_KEY = "coder:sidebar-open";

export function readSidebarOpen(defaultValue = true): boolean {
  try {
    const raw = getKVStore().getItem(SIDEBAR_STORAGE_KEY);
    if (raw === null) {
      return defaultValue;
    }
    return raw === "true";
  } catch {
    return defaultValue;
  }
}

export function writeSidebarOpen(open: boolean): void {
  try {
    getKVStore().setItem(SIDEBAR_STORAGE_KEY, String(open));
  } catch {
    // KV store may be unavailable (e.g. private browsing in some browsers)
  }
}
