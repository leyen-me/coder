import { apiGet } from "@/lib/api/client";

import { readWorkspaceDir } from "./storage";

type ServerInfo = {
  workspaceDir?: string;
};

/** Resolves the default path shown when opening the workspace picker. */
export async function resolveDefaultWorkspacePath(): Promise<string> {
  const saved = readWorkspaceDir()?.trim();
  if (saved) {
    return saved;
  }

  try {
    const info = await apiGet<ServerInfo>("/api/server_info");
    return info.workspaceDir?.trim() ?? "";
  } catch {
    return "";
  }
}
