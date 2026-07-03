/**
 * Returns the current Git branch name for the given workspace directory.
 * Returns `null` when the directory is not a Git repository or Git is not available.
 */
export async function getCurrentGitBranch(
  _workspaceDir: string
): Promise<string | null> {
  return null;
}
