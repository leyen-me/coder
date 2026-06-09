import { invoke, isTauri } from "@tauri-apps/api/core";

import type { ReadFileData } from "@/features/agent/tools/types";

export async function readWorkspaceFile(
  workspaceDir: string,
  path: string
): Promise<ReadFileData> {
  if (!isTauri()) {
    throw new Error("read_file is only available in the desktop app");
  }

  return invoke<ReadFileData>("tool_read_file", {
    workspaceDir,
    path,
    startLine: 1,
    maxLines: 500,
    respectGitignore: true,
    numbered: false,
  });
}
