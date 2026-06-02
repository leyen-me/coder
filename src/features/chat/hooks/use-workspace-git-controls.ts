import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkoutGitBranch,
  fetchGitBranches,
  type GitBranchesResponse,
} from "@/features/workspace/git";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";

type UseWorkspaceGitControlsInput = {
  workspaceDir: string | null;
  enabled: boolean;
};

type UseWorkspaceGitControlsResult = {
  workspaceName: string | null;
  gitBranch: string | null;
  gitBranches: readonly string[];
  isGitRepository: boolean;
  isGitLoading: boolean;
  checkoutBranch: (branch: string) => Promise<void>;
  refreshGit: () => Promise<void>;
};

export function useWorkspaceGitControls({
  workspaceDir,
  enabled,
}: UseWorkspaceGitControlsInput): UseWorkspaceGitControlsResult {
  const [gitState, setGitState] = useState<GitBranchesResponse | null>(null);
  const [isGitLoading, setIsGitLoading] = useState(false);
  const workspaceDirRef = useRef(workspaceDir);
  workspaceDirRef.current = workspaceDir;

  const loadGitState = useCallback(async (targetDir: string | null) => {
    const trimmed = targetDir?.trim() ?? "";
    if (!trimmed) {
      setGitState(null);
      setIsGitLoading(false);
      return;
    }

    setIsGitLoading(true);
    try {
      const response = await fetchGitBranches(trimmed);
      if (workspaceDirRef.current?.trim() === trimmed) {
        setGitState(response);
      }
    } finally {
      if (workspaceDirRef.current?.trim() === trimmed) {
        setIsGitLoading(false);
      }
    }
  }, []);

  const refreshGit = useCallback(async () => {
    if (!enabled) {
      setGitState(null);
      setIsGitLoading(false);
      return;
    }

    await loadGitState(workspaceDirRef.current);
  }, [enabled, loadGitState]);

  useEffect(() => {
    if (!enabled) {
      setGitState(null);
      setIsGitLoading(false);
      return;
    }

    const trimmed = workspaceDir?.trim() ?? "";
    setGitState(null);

    if (!trimmed) {
      setIsGitLoading(false);
      return;
    }

    void loadGitState(trimmed);
  }, [enabled, loadGitState, workspaceDir]);

  const checkoutBranch = useCallback(
    async (branch: string) => {
      const trimmed = workspaceDirRef.current?.trim();
      if (!trimmed) {
        return;
      }

      await checkoutGitBranch(trimmed, branch);
      await loadGitState(trimmed);
    },
    [loadGitState]
  );

  const currentBranch = gitState?.currentBranch ?? null;
  const branches = gitState?.branches ?? [];

  return {
    workspaceName: workspaceDir ? getWorkspaceDisplayName(workspaceDir) : null,
    gitBranch: currentBranch,
    gitBranches: branches,
    isGitRepository: branches.length > 0,
    isGitLoading,
    checkoutBranch,
    refreshGit,
  };
}
