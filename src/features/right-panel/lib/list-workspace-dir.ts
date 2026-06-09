import { invoke, isTauri } from "@tauri-apps/api/core";

import type { ListDirData } from "@/features/agent/tools/types";

export async function listWorkspaceDir(
  workspaceDir: string,
  path: string
): Promise<ListDirData> {
  if (!isTauri()) {
    throw new Error("list_dir is only available in the desktop app");
  }

  return invoke<ListDirData>("tool_list_dir", {
    workspaceDir,
    path,
    recursive: false,
    maxDepth: 1,
    showHidden: false,
  });
}
