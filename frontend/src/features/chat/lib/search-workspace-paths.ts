import { apiPost } from "@/lib/api/client";

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
  workspaceDir: string,
  query: string,
  options?: { headLimit?: number; respectGitignore?: boolean }
): Promise<SearchWorkspacePathsResult> {
  // Workspace path search is handled by the server in browser mode.
  return {
    query,
    matches: [],
    totalMatches: 0,
    truncated: false,
  };
}
