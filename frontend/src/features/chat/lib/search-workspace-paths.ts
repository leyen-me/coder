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
  return apiPost<SearchWorkspacePathsResult>("/api/search_workspace_paths", {
    workspaceDir,
    query,
    headLimit: options?.headLimit,
    respectGitignore: options?.respectGitignore,
  });
}
