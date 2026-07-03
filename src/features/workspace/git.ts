import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Returns the current Git branch name for the given workspace directory.
 * Returns `null` when the directory is not a Git repository or Git is not available.
 */
export async function getCurrentGitBranch(
  workspaceDir: string
): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  try {
    return await invoke<string | null>("git_current_branch", {
      workspaceDir,
    });
  } catch {
    return null;
  }
}
