import { apiGet } from "@/lib/api/client";

type ServerInfo = {
  workspaceDir?: string;
};

export async function resolveHomeDirectory(): Promise<string | null> {
  try {
    const info = await apiGet<ServerInfo>("/api/server_info");
    return info.workspaceDir?.trim() || null;
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
