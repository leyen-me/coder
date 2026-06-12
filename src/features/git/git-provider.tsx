"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  GitCommitEntry,
  GitStashEntry,
  GitStatusEntry,
  SourceControlTab,
} from "./types";
import * as gitService from "./git-service";

export type GitContextValue = {
  /** Current branch name. */
  currentBranch: string | null;
  /** All local branches. */
  branches: string[];
  /** File status entries (staged + unstaged). */
  statusEntries: GitStatusEntry[];
  /** Recent commits. */
  recentCommits: GitCommitEntry[];
  /** Stash entries. */
  stashList: GitStashEntry[];
  /** Whether any git data is loading. */
  isLoading: boolean;
  /** Error message from last operation. */
  error: string | null;
  /** Active sub-tab within the source control panel. */
  activeTab: SourceControlTab;
  setActiveTab: (tab: SourceControlTab) => void;
  /** Refresh all git data from the backend. */
  refresh: () => Promise<void>;
  /** Stage specific files. */
  stageFiles: (paths: string[]) => Promise<void>;
  /** Unstage specific files. */
  unstageFiles: (paths: string[]) => Promise<void>;
  /** Stage all changes. */
  stageAll: () => Promise<void>;
  /** Unstage all changes. */
  unstageAll: () => Promise<void>;
  /** Create a commit. */
  commit: (message: string) => Promise<void>;
  /** Switch branch. */
  checkoutBranch: (branch: string) => Promise<void>;
  /** Create a new branch. */
  createBranch: (name: string) => Promise<void>;
  /** Delete a branch. */
  deleteBranch: (name: string, force?: boolean) => Promise<void>;
  /** Push to remote. */
  push: (remote?: string, branch?: string) => Promise<string>;
  /** Pull from remote. */
  pull: (remote?: string, branch?: string) => Promise<string>;
  /** Fetch from remote. */
  fetch: (remote?: string) => Promise<string>;
  /** Stash changes. */
  stashPush: (message?: string) => Promise<void>;
  /** Pop a stash. */
  stashPop: (index?: number) => Promise<void>;
  /** Drop a stash. */
  stashDrop: (index?: number) => Promise<void>;
  /** Apply a stash without dropping. */
  stashApply: (index?: number) => Promise<void>;
  /** Get remote URL. */
  remoteUrl: string | null;
};

const GitContext = createContext<GitContextValue | null>(null);

type GitProviderProps = {
  children: ReactNode;
  workspaceDir: string | null;
};

export function GitProvider({ children, workspaceDir }: GitProviderProps) {
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [statusEntries, setStatusEntries] = useState<GitStatusEntry[]>([]);
  const [recentCommits, setRecentCommits] = useState<GitCommitEntry[]>([]);
  const [stashList, setStashList] = useState<GitStashEntry[]>([]);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SourceControlTab>("changes");

  const refresh = useCallback(async () => {
    if (!workspaceDir) return;
    setIsLoading(true);
    setError(null);

    try {
      const [statusRes, branchRes, log, stashes, url] = await Promise.all([
        gitService.fetchGitStatus(workspaceDir),
        gitService.fetchGitBranches(workspaceDir).catch(() => null),
        gitService.fetchGitLog(workspaceDir, 50).catch(() => [] as GitCommitEntry[]),
        gitService.fetchStashList(workspaceDir).catch(() => [] as GitStashEntry[]),
        gitService.getRemoteUrl(workspaceDir).catch(() => null),
      ]);

      if (statusRes) {
        setStatusEntries(statusRes.entries);
        setCurrentBranch(statusRes.currentBranch);
      }
      if (branchRes) {
        setBranches(branchRes.branches);
      }
      setRecentCommits(log);
      setStashList(stashes);
      setRemoteUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Git operation failed");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceDir]);

  // Auto-refresh when workspace changes
  useEffect(() => {
    if (workspaceDir) {
      void refresh();
    } else {
      setCurrentBranch(null);
      setBranches([]);
      setStatusEntries([]);
      setRecentCommits([]);
      setStashList([]);
      setRemoteUrl(null);
      setError(null);
    }
  }, [refresh, workspaceDir]);

  const stageFiles = useCallback(
    async (paths: string[]) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.stageFiles(workspaceDir, paths);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stage failed");
      }
    },
    [workspaceDir, refresh],
  );

  const unstageFiles = useCallback(
    async (paths: string[]) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.unstageFiles(workspaceDir, paths);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unstage failed");
      }
    },
    [workspaceDir, refresh],
  );

  const stageAll = useCallback(async () => {
    if (!workspaceDir) return;
    setError(null);
    try {
      await gitService.stageAll(workspaceDir);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stage all failed");
    }
  }, [workspaceDir, refresh]);

  const unstageAll = useCallback(async () => {
    if (!workspaceDir) return;
    setError(null);
    try {
      await gitService.unstageAll(workspaceDir);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unstage all failed");
    }
  }, [workspaceDir, refresh]);

  const commit = useCallback(
    async (message: string) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.commit(workspaceDir, message);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Commit failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const checkoutBranch = useCallback(
    async (branch: string) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.checkoutBranch(workspaceDir, branch);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Checkout failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const createBranch = useCallback(
    async (name: string) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.createBranch(workspaceDir, name);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Create branch failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const deleteBranch = useCallback(
    async (name: string, force?: boolean) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.deleteBranch(workspaceDir, name, force);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete branch failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const push = useCallback(
    async (remote?: string, branch?: string) => {
      if (!workspaceDir) return "";
      setError(null);
      try {
        const result = await gitService.push(workspaceDir, remote, branch);
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Push failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const pull = useCallback(
    async (remote?: string, branch?: string) => {
      if (!workspaceDir) return "";
      setError(null);
      try {
        const result = await gitService.pull(workspaceDir, remote, branch);
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pull failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const fetch = useCallback(
    async (remote?: string) => {
      if (!workspaceDir) return "";
      setError(null);
      try {
        const result = await gitService.fetch(workspaceDir, remote);
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fetch failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const stashPush = useCallback(
    async (message?: string) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.stashPush(workspaceDir, message);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stash failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const stashPop = useCallback(
    async (index?: number) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.stashPop(workspaceDir, index);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stash pop failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const stashDrop = useCallback(
    async (index?: number) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.stashDrop(workspaceDir, index);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stash drop failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const stashApply = useCallback(
    async (index?: number) => {
      if (!workspaceDir) return;
      setError(null);
      try {
        await gitService.stashApply(workspaceDir, index);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stash apply failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const value = useMemo<GitContextValue>(
    () => ({
      currentBranch,
      branches,
      statusEntries,
      recentCommits,
      stashList,
      isLoading,
      error,
      activeTab,
      setActiveTab,
      remoteUrl,
      refresh,
      stageFiles,
      unstageFiles,
      stageAll,
      unstageAll,
      commit,
      checkoutBranch,
      createBranch,
      deleteBranch,
      push,
      pull,
      fetch,
      stashPush,
      stashPop,
      stashDrop,
      stashApply,
    }),
    [
      currentBranch,
      branches,
      statusEntries,
      recentCommits,
      stashList,
      isLoading,
      error,
      activeTab,
      remoteUrl,
      refresh,
      stageFiles,
      unstageFiles,
      stageAll,
      unstageAll,
      commit,
      checkoutBranch,
      createBranch,
      deleteBranch,
      push,
      pull,
      fetch,
      stashPush,
      stashPop,
      stashDrop,
      stashApply,
    ],
  );

  return <GitContext.Provider value={value}>{children}</GitContext.Provider>;
}

export function useGit(): GitContextValue {
  const context = useContext(GitContext);
  if (!context) {
    throw new Error("useGit must be used within a GitProvider");
  }
  return context;
}
