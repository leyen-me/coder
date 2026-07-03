import { useCallback, useEffect, useRef, useState } from "react";

import { getCurrentGitBranch } from "@/features/workspace/git";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";

type UseWorkspaceGitControlsInput = {
  workspaceDir: string | null;
  enabled: boolean;
};

type UseWorkspaceGitControlsResult = {
  workspaceName: string | null;
  gitBranch: string | null;
  isGitRepository: boolean;
  refreshGit: () => Promise<void>;
};

export function useWorkspaceGitControls({
  workspaceDir,
  enabled,
}: UseWorkspaceGitControlsInput): UseWorkspaceGitControlsResult {
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const workspaceDirRef = useRef(workspaceDir);
  workspaceDirRef.current = workspaceDir;

  const loadGitBranch = useCallback(async (targetDir: string | null) => {
    const trimmed = targetDir?.trim() ?? "";
    if (!trimmed) {
      setGitBranch(null);
      return;
    }

    try {
      const branch = await getCurrentGitBranch(trimmed);
      if (workspaceDirRef.current?.trim() === trimmed) {
        setGitBranch(branch);
      }
    } catch {
      if (workspaceDirRef.current?.trim() === trimmed) {
        setGitBranch(null);
      }
    }
  }, []);

  const refreshGit = useCallback(async () => {
    if (!enabled) {
      setGitBranch(null);
      return;
    }

    await loadGitBranch(workspaceDirRef.current);
  }, [enabled, loadGitBranch]);

  useEffect(() => {
    if (!enabled) {
      setGitBranch(null);
      return;
    }

    const trimmed = workspaceDir?.trim() ?? "";
    setGitBranch(null);

    if (!trimmed) {
      return;
    }

    void loadGitBranch(trimmed);
  }, [enabled, loadGitBranch, workspaceDir]);

  return {
    workspaceName: workspaceDir ? getWorkspaceDisplayName(workspaceDir) : null,
    gitBranch,
    isGitRepository: gitBranch != null,
    refreshGit,
  };
}
