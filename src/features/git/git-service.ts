import { invoke, isTauri } from "@tauri-apps/api/core";

import type {
  GitAheadBehind,
  GitBranchesResponse,
  GitCommitEntry,
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
// Init
// ---------------------------------------------------------------------------

export async function initRepo(workspaceDir: string): Promise<void> {
  assertTauri();
  await invoke("git_init", { workspaceDir });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function fetchGitStatus(
  workspaceDir: string,
): Promise<GitStatusResponse | null> {
  if (!isTauri()) return null;
  return await invoke<GitStatusResponse>("git_status", { workspaceDir });
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

export async function discardFiles(
  workspaceDir: string,
  paths: string[],
  untrackedPaths: string[],
): Promise<void> {
  assertTauri();
  await invoke("git_discard_files", { workspaceDir, paths, untrackedPaths });
}

export async function discardAll(workspaceDir: string): Promise<void> {
  assertTauri();
  await invoke("git_discard_all", { workspaceDir });
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

export async function revertCommit(
  workspaceDir: string,
  hash: string,
): Promise<void> {
  assertTauri();
  await invoke("git_revert", { workspaceDir, hash });
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

export async function fetchGitLog(
  workspaceDir: string,
  maxCount?: number,
  skip?: number,
): Promise<GitCommitEntry[]> {
  assertTauri();
  return await invoke<GitCommitEntry[]>("git_log", {
    workspaceDir,
    maxCount: maxCount ?? 50,
    skip: skip ?? 0,
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
  return await invoke<GitBranchesResponse>("git_list_branches", {
    workspaceDir,
  });
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

export async function getAheadBehind(
  workspaceDir: string,
): Promise<GitAheadBehind> {
  if (!isTauri()) return { ahead: 0, behind: 0 };
  return await invoke<GitAheadBehind>("git_ahead_behind", { workspaceDir });
}

export { checkoutGitBranch } from "@/features/workspace/git";
