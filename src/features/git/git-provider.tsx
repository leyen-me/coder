"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  GitCommitEntry,
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
  /** Whether the history view can load more commits. */
  hasMoreRecentCommits: boolean;
  /** Whether additional history entries are loading. */
  isLoadingMoreRecentCommits: boolean;
  /** Whether the workspace is a valid git repository. */
  isGitRepo: boolean;
  /** Whether any git data is loading. */
  isLoading: boolean;
  /** Error message from last operation. */
  error: string | null;
  /** Active sub-tab within the source control panel. */
  activeTab: SourceControlTab;
  setActiveTab: (tab: SourceControlTab) => void;
  /** Refresh all git data from the backend. */
  refresh: () => Promise<void>;
  /** Load the next page of commit history. */
  loadMoreRecentCommits: () => Promise<void>;
  /** Stage specific files. */
  stageFiles: (paths: string[]) => Promise<void>;
  /** Unstage specific files. */
  unstageFiles: (paths: string[]) => Promise<void>;
  /** Stage all changes. */
  stageAll: () => Promise<void>;
  /** Unstage all changes. */
  unstageAll: () => Promise<void>;
  /** Discard specific file changes and restore them from git. */
  discardFiles: (entries: GitStatusEntry[]) => Promise<void>;
  /** Discard all working tree and index changes. */
  discardAll: () => Promise<void>;
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
  /** Get remote URL. */
  remoteUrl: string | null;
  /** Initialize a git repository in the workspace. */
  initRepo: () => Promise<void>;
  /** Commits ahead of upstream (unpushed). */
  aheadCount: number;
  /** Commits behind upstream (unpulled). */
  behindCount: number;
};

const HISTORY_PAGE_SIZE = 50;

const GitContext = createContext<GitContextValue | null>(null);

type GitProviderProps = {
  children: ReactNode;
  workspaceDir: string | null;
  /** When true the Source Control panel is visible. Triggers a refresh on transition to true. */
  isActive: boolean;
};

export function GitProvider({ children, workspaceDir, isActive }: GitProviderProps) {
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [statusEntries, setStatusEntries] = useState<GitStatusEntry[]>([]);
  const [recentCommits, setRecentCommits] = useState<GitCommitEntry[]>([]);
  const [hasMoreRecentCommits, setHasMoreRecentCommits] = useState(false);
  const [isLoadingMoreRecentCommits, setIsLoadingMoreRecentCommits] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [aheadCount, setAheadCount] = useState(0);
  const [behindCount, setBehindCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(true);
  const [activeTab, setActiveTab] = useState<SourceControlTab>("changes");
  const wasActiveRef = useRef(isActive);

  // Auto-refresh when the panel becomes visible (opened or tab switched to it).
  // This ensures data is always fresh when the user looks at the Source Control panel.
  useEffect(() => {
    if (isActive && !wasActiveRef.current && workspaceDir) {
      wasActiveRef.current = true;
      void refresh();
    } else if (!isActive) {
      wasActiveRef.current = false;
    }
  }); // run every render to detect transitions
  // Note: intentional — we need to detect transitions without depending on `refresh` (stable ref)

  const refresh = useCallback(async () => {
    if (!workspaceDir) return;
    setIsLoading(true);
    setError(null);

    // Fetch all git state in parallel.
    // If git_status fails with "not a git repository", mark isGitRepo = false.
    const statusPromise = gitService.fetchGitStatus(workspaceDir);
    const branchesPromise = gitService.fetchGitBranches(workspaceDir);
    const logPromise = gitService.fetchGitLog(workspaceDir, HISTORY_PAGE_SIZE);
    const urlPromise = gitService.getRemoteUrl(workspaceDir);
    const aheadBehindPromise = gitService.getAheadBehind(workspaceDir);

    const [statusRes, branchRes, log, url, aheadBehind] = await Promise.all([
      statusPromise.catch((err: unknown) => {
        const msg = typeof err === "string" ? err : String(err);
        if (msg.toLowerCase().includes("not a git repository")) {
          setIsGitRepo(false);
        } else {
          setError(msg);
        }
        return null;
      }),
      branchesPromise.catch(() => null),
      logPromise.catch(() => [] as GitCommitEntry[]),
      urlPromise.catch(() => null),
      aheadBehindPromise.catch(() => ({ ahead: 0, behind: 0 })),
    ]);

    if (statusRes) {
      setStatusEntries(statusRes.entries);
      setCurrentBranch(statusRes.currentBranch);
      setIsGitRepo(true);
    }
    if (branchRes) {
      setBranches(branchRes.branches);
    }
    setRecentCommits(log);
    setHasMoreRecentCommits(log.length === HISTORY_PAGE_SIZE);
    setIsLoadingMoreRecentCommits(false);
    setRemoteUrl(url);
    if (aheadBehind) {
      setAheadCount(aheadBehind.ahead);
      setBehindCount(aheadBehind.behind);
    } else {
      setAheadCount(0);
      setBehindCount(0);
    }
    setIsLoading(false);
  }, [workspaceDir]);

  const loadMoreRecentCommits = useCallback(async () => {
    if (!workspaceDir || isLoadingMoreRecentCommits || !hasMoreRecentCommits) {
      return;
    }

    setIsLoadingMoreRecentCommits(true);
    try {
      const nextPage = await gitService.fetchGitLog(
        workspaceDir,
        HISTORY_PAGE_SIZE,
        recentCommits.length,
      );
      setRecentCommits((current) => {
        const existingHashes = new Set(current.map((commit) => commit.hash));
        const uniqueNextPage = nextPage.filter((commit) => !existingHashes.has(commit.hash));
        return [...current, ...uniqueNextPage];
      });
      setHasMoreRecentCommits(nextPage.length === HISTORY_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load commit history failed");
    } finally {
      setIsLoadingMoreRecentCommits(false);
    }
  }, [
    workspaceDir,
    isLoadingMoreRecentCommits,
    hasMoreRecentCommits,
    recentCommits.length,
  ]);

  // Auto-refresh when workspace changes
  useEffect(() => {
    if (workspaceDir) {
      void refresh();
    } else {
      setCurrentBranch(null);
      setBranches([]);
      setStatusEntries([]);
      setRecentCommits([]);
      setHasMoreRecentCommits(false);
      setIsLoadingMoreRecentCommits(false);
      setRemoteUrl(null);
      setIsGitRepo(true);
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

  const discardFiles = useCallback(
    async (entries: GitStatusEntry[]) => {
      if (!workspaceDir || entries.length === 0) return;
      setError(null);
      try {
        const paths = Array.from(new Set(entries.map((entry) => entry.path)));
        const untrackedPaths = Array.from(
          new Set(
            entries
              .filter((entry) => entry.status === "untracked")
              .map((entry) => entry.path),
          ),
        );
        await gitService.discardFiles(workspaceDir, paths, untrackedPaths);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Discard failed");
        throw err;
      }
    },
    [workspaceDir, refresh],
  );

  const discardAll = useCallback(async () => {
    if (!workspaceDir) return;
    setError(null);
    try {
      await gitService.discardAll(workspaceDir);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discard all failed");
      throw err;
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

  const initRepo = useCallback(async () => {
    if (!workspaceDir) return;
    setError(null);
    setIsLoading(true);
    try {
      await gitService.initRepo(workspaceDir);
      setIsGitRepo(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Init repo failed");
      setIsLoading(false);
      throw err;
    }
  }, [workspaceDir, refresh]);

  const value = useMemo<GitContextValue>(
    () => ({
      currentBranch,
      branches,
      statusEntries,
      recentCommits,
      hasMoreRecentCommits,
      isLoadingMoreRecentCommits,
      isLoading,
      error,
      isGitRepo,
      activeTab,
      setActiveTab,
      remoteUrl,
      aheadCount,
      behindCount,
      refresh,
      loadMoreRecentCommits,
      stageFiles,
      unstageFiles,
      stageAll,
      unstageAll,
      discardFiles,
      discardAll,
      commit,
      checkoutBranch,
      createBranch,
      deleteBranch,
      push,
      pull,
      fetch,
      initRepo,
    }),
    [
      currentBranch,
      branches,
      statusEntries,
      recentCommits,
      hasMoreRecentCommits,
      isLoadingMoreRecentCommits,
      isLoading,
      error,
      isGitRepo,
      activeTab,
      remoteUrl,
      aheadCount,
      behindCount,
      refresh,
      loadMoreRecentCommits,
      stageFiles,
      unstageFiles,
      stageAll,
      unstageAll,
      discardFiles,
      discardAll,
      commit,
      checkoutBranch,
      createBranch,
      deleteBranch,
      push,
      pull,
      fetch,
      initRepo,
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
