import { useCallback, useEffect, useState } from "react";

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

  const refreshGit = useCallback(async () => {
    if (!enabled || !workspaceDir?.trim()) {
      setGitState(null);
      return;
    }

    setIsGitLoading(true);
    try {
      const response = await fetchGitBranches(workspaceDir.trim());
      setGitState(response);
    } finally {
      setIsGitLoading(false);
    }
  }, [enabled, workspaceDir]);

  useEffect(() => {
    void refreshGit();
  }, [refreshGit]);

  const checkoutBranch = useCallback(
    async (branch: string) => {
      if (!workspaceDir?.trim()) {
        return;
      }

      await checkoutGitBranch(workspaceDir.trim(), branch);
      await refreshGit();
    },
    [refreshGit, workspaceDir]
  );

  const currentBranch = gitState?.currentBranch ?? null;
  const branches =
    gitState?.branches.length
      ? gitState.branches
      : currentBranch
        ? [currentBranch]
        : [];

  return {
    workspaceName: workspaceDir ? getWorkspaceDisplayName(workspaceDir) : null,
    gitBranch: currentBranch,
    gitBranches: branches,
    isGitRepository: Boolean(gitState?.branches.length || currentBranch),
    isGitLoading,
    checkoutBranch,
    refreshGit,
  };
}
