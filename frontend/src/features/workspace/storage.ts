import { getKVStore } from "@/lib/storage";
import { stripWindowsVerbatimPrefix } from "@/lib/path";

import { WORKSPACE_STORAGE_KEY } from "./constants";

export function readWorkspaceDir(): string | null {
  const value = getKVStore().getItem(WORKSPACE_STORAGE_KEY)?.trim();
  if (!value) {
    return null;
  }

  const normalized = stripWindowsVerbatimPrefix(value);
  if (normalized !== value) {
    getKVStore().setItem(WORKSPACE_STORAGE_KEY, normalized);
  }

  return normalized || null;
}

export function writeWorkspaceDir(path: string | null): void {
  if (!path?.trim()) {
    getKVStore().removeItem(WORKSPACE_STORAGE_KEY);
    return;
  }

  getKVStore().setItem(
    WORKSPACE_STORAGE_KEY,
    stripWindowsVerbatimPrefix(path.trim())
  );
}

export function getWorkspaceDisplayName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/);
  return segments.at(-1) || normalized;
}
