import { invoke, isTauri } from "@tauri-apps/api/core";

export type GitBranchesResponse = {
  currentBranch: string | null;
  branches: string[];
};

export async function fetchGitBranches(
  workspaceDir: string
): Promise<GitBranchesResponse | null> {
  if (!isTauri()) {
    return null;
  }

  try {
    return await invoke<GitBranchesResponse>("git_list_branches", {
      workspaceDir,
    });
  } catch {
    return null;
  }
}

export async function checkoutGitBranch(
  workspaceDir: string,
  branch: string
): Promise<void> {
  if (!isTauri()) {
    throw new Error("Git checkout is only available in the desktop app");
  }

  await invoke("git_checkout_branch", { workspaceDir, branch });
}
