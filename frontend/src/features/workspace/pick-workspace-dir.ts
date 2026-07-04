import { apiGet } from "@/lib/api/client";

import { readWorkspaceDir } from "./storage";

type ServerInfo = {
  workspaceDir?: string;
};

export async function pickWorkspaceDir(): Promise<string | null> {
  let defaultPath = readWorkspaceDir() ?? "";

  try {
    const info = await apiGet<ServerInfo>("/api/server_info");
    if (info.workspaceDir?.trim()) {
      defaultPath = info.workspaceDir.trim();
    }
  } catch {
    // Fall back to the locally stored workspace path.
  }

  const input = window.prompt("Enter workspace directory path:", defaultPath);
  if (input === null) {
    return null;
  }

  const trimmed = input.trim();
  return trimmed || null;
}
