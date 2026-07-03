import { apiPost } from "@/lib/api/client";

/**
 * Returns the current Git branch name for the given workspace directory.
 * Delegates to the Rust backend which has filesystem access.
 */
export async function getCurrentGitBranch(
  workspaceDir: string
): Promise<string | null> {
  try {
    const result = await apiPost<string | null>(
      "/api/git_current_branch",
      { workspace_dir: workspaceDir }
    );
    return result ?? null;
  } catch {
    return null;
  }
}
