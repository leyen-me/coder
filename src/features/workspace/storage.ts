import { getKVStore } from "@/lib/storage";
import { WORKSPACE_STORAGE_KEY } from "./constants";

export function readWorkspaceDir(): string | null {
  const value = getKVStore().getItem(WORKSPACE_STORAGE_KEY)?.trim();
  return value || null;
}

export function writeWorkspaceDir(path: string | null): void {
  if (!path?.trim()) {
    getKVStore().removeItem(WORKSPACE_STORAGE_KEY);
    return;
  }

  getKVStore().setItem(WORKSPACE_STORAGE_KEY, path.trim());
}

export function getWorkspaceDisplayName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/);
  return segments.at(-1) || normalized;
}
