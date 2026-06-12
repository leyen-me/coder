import { invoke, isTauri } from "@tauri-apps/api/core";

import type {
  GitBranchesResponse,
  GitCommitEntry,
  GitStashEntry,
  GitStatusResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertTauri(): void {
  if (!isTauri()) {
    throw new Error("Git operations are only available in the desktop app");
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function fetchGitStatus(
  workspaceDir: string,
): Promise<GitStatusResponse | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<GitStatusResponse>("git_status", { workspaceDir });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage / Unstage
// ---------------------------------------------------------------------------

export async function stageFiles(
  workspaceDir: string,
  paths: string[],
): Promise<void> {
  assertTauri();
  await invoke("git_stage_files", { workspaceDir, paths });
}

export async function unstageFiles(
  workspaceDir: string,
  paths: string[],
): Promise<void> {
  assertTauri();
  await invoke("git_unstage_files", { workspaceDir, paths });
}

export async function stageAll(workspaceDir: string): Promise<void> {
  assertTauri();
  await invoke("git_stage_all", { workspaceDir });
}

export async function unstageAll(workspaceDir: string): Promise<void> {
  assertTauri();
  await invoke("git_unstage_all", { workspaceDir });
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export async function commit(
  workspaceDir: string,
  message: string,
): Promise<void> {
  assertTauri();
  await invoke("git_commit", { workspaceDir, message });
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

export async function fetchGitLog(
  workspaceDir: string,
  maxCount?: number,
): Promise<GitCommitEntry[]> {
  assertTauri();
  return await invoke<GitCommitEntry[]>("git_log", {
    workspaceDir,
    maxCount: maxCount ?? 50,
  });
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export async function getFileDiff(
  workspaceDir: string,
  filePath: string,
  staged?: boolean,
): Promise<string> {
  assertTauri();
  return await invoke<string>("git_diff", {
    workspaceDir,
    filePath,
    staged: staged ?? false,
  });
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function fetchGitBranches(
  workspaceDir: string,
): Promise<GitBranchesResponse | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<GitBranchesResponse>("git_list_branches", {
      workspaceDir,
    });
  } catch {
    return null;
  }
}

export async function checkoutBranch(
  workspaceDir: string,
  branch: string,
): Promise<void> {
  assertTauri();
  await invoke("git_checkout_branch", { workspaceDir, branch });
}

export async function createBranch(
  workspaceDir: string,
  name: string,
): Promise<void> {
  assertTauri();
  await invoke("git_create_branch", { workspaceDir, name });
}

export async function deleteBranch(
  workspaceDir: string,
  name: string,
  force?: boolean,
): Promise<void> {
  assertTauri();
  if (force) {
    await invoke("git_delete_branch_force", { workspaceDir, name });
  } else {
    await invoke("git_delete_branch", { workspaceDir, name });
  }
}

// ---------------------------------------------------------------------------
// Remote
// ---------------------------------------------------------------------------

export async function push(
  workspaceDir: string,
  remote?: string,
  branch?: string,
): Promise<string> {
  assertTauri();
  return await invoke<string>("git_push", { workspaceDir, remote, branch });
}

export async function pull(
  workspaceDir: string,
  remote?: string,
  branch?: string,
): Promise<string> {
  assertTauri();
  return await invoke<string>("git_pull", { workspaceDir, remote, branch });
}

export async function fetch(
  workspaceDir: string,
  remote?: string,
): Promise<string> {
  assertTauri();
  return await invoke<string>("git_fetch", { workspaceDir, remote });
}

export async function getRemoteUrl(
  workspaceDir: string,
  remote?: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string | null>("git_get_remote_url", {
      workspaceDir,
      remote,
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stash
// ---------------------------------------------------------------------------

export async function fetchStashList(
  workspaceDir: string,
): Promise<GitStashEntry[]> {
  assertTauri();
  return await invoke<GitStashEntry[]>("git_stash_list", { workspaceDir });
}

export async function stashPush(
  workspaceDir: string,
  message?: string,
): Promise<void> {
  assertTauri();
  await invoke("git_stash_push", { workspaceDir, message });
}

export async function stashPop(
  workspaceDir: string,
  index?: number,
): Promise<void> {
  assertTauri();
  await invoke("git_stash_pop", { workspaceDir, index });
}

export async function stashDrop(
  workspaceDir: string,
  index?: number,
): Promise<void> {
  assertTauri();
  await invoke("git_stash_drop", { workspaceDir, index });
}

export async function stashApply(
  workspaceDir: string,
  index?: number,
): Promise<void> {
  assertTauri();
  await invoke("git_stash_apply", { workspaceDir, index });
}

export { checkoutGitBranch } from "@/features/workspace/git";
