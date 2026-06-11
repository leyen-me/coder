import { invoke, isTauri } from "@tauri-apps/api/core";

import type { FileModifyData } from "@/features/agent/tools/types";

export async function saveWorkspaceFile(
  workspaceDir: string,
  path: string,
  content: string,
  expectedSha256: string
): Promise<FileModifyData> {
  if (!isTauri()) {
    throw new Error("save_file is only available in the desktop app");
  }

  return invoke<FileModifyData>("tool_replace_file", {
    workspaceDir,
    path,
    content,
    expectedSha256,
    createBackup: false,
    respectGitignore: true,
  });
}
