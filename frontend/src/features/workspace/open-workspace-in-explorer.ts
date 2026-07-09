import { openPathInExplorer } from "./open-path-in-explorer";

export async function openWorkspaceInExplorer(
  workspaceDir: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return openPathInExplorer(workspaceDir);
}
