import { invoke, isTauri } from "@tauri-apps/api/core";

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
  if (!isTauri()) {
    return {
      query,
      matches: [],
      totalMatches: 0,
      truncated: false,
    };
  }

  return invoke<SearchWorkspacePathsResult>("tool_search_workspace_paths", {
    workspaceDir,
    query,
    headLimit: options?.headLimit,
    respectGitignore: options?.respectGitignore,
  });
}
