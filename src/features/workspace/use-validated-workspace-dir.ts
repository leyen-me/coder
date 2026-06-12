import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import type { ListDirData } from "@/features/agent/tools/types";

/**
 * Normalizes a workspace path and suppresses stale/nonexistent directories.
 * Invalid workspaces are exposed as `null` so UI callers can render fallback state
 * instead of surfacing low-level filesystem errors.
 */
export function useValidatedWorkspaceDir(
  workspaceDir: string | null | undefined
): string | null {
  const [validatedWorkspaceDir, setValidatedWorkspaceDir] = useState<string | null>(
    workspaceDir?.trim() || null
  );

  useEffect(() => {
    let cancelled = false;
    const nextWorkspaceDir = workspaceDir?.trim() || null;

    if (!nextWorkspaceDir) {
      setValidatedWorkspaceDir(null);
      return () => {
        cancelled = true;
      };
    }

    if (!isTauri()) {
      setValidatedWorkspaceDir(nextWorkspaceDir);
      return () => {
        cancelled = true;
      };
    }

    setValidatedWorkspaceDir(null);

    void invoke<ListDirData>("tool_list_dir", {
      workspaceDir: nextWorkspaceDir,
      path: ".",
      recursive: false,
      maxDepth: 1,
      showHidden: false,
    })
      .then(() => {
        if (!cancelled) {
          setValidatedWorkspaceDir(nextWorkspaceDir);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setValidatedWorkspaceDir(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceDir]);

  return validatedWorkspaceDir;
}
