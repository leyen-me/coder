import { isTauri } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";

export async function resolveHomeDirectory(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  try {
    return await homeDir();
  } catch {
    return null;
  }
}

export async function resolveTerminalCwd(
  workspaceDir: string | null
): Promise<string | null> {
  const trimmedWorkspace = workspaceDir?.trim();
  if (trimmedWorkspace) {
    return trimmedWorkspace;
  }

  return resolveHomeDirectory();
}
