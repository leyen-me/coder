export type WorkspacePathMatch = {
  name: string;
  path: string;
  isDir: boolean;
};

export type SearchWorkspacePathsResult = {
  query: string;
  matches: WorkspacePathMatch[];
  totalMatches: number;
  truncated: boolean;
};

export async function searchWorkspacePaths(
  _workspaceDir: string,
  query: string,
  _options?: { headLimit?: number; respectGitignore?: boolean }
): Promise<SearchWorkspacePathsResult> {
  // Workspace path search is handled by the server in browser mode.
  return {
    query,
    matches: [],
    totalMatches: 0,
    truncated: false,
  };
}
