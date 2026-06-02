import { WORKSPACE_STORAGE_KEY } from "./constants";

export function readWorkspaceDir(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  const value = localStorage.getItem(WORKSPACE_STORAGE_KEY)?.trim();
  return value || null;
}

export function writeWorkspaceDir(path: string | null): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  if (!path?.trim()) {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    return;
  }

  localStorage.setItem(WORKSPACE_STORAGE_KEY, path.trim());
}

export function getWorkspaceDisplayName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/);
  return segments.at(-1) || normalized;
}
