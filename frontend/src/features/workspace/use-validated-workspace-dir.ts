import { useEffect, useState } from "react";

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
    const nextWorkspaceDir = workspaceDir?.trim() || null;

    if (!nextWorkspaceDir) {
      setValidatedWorkspaceDir(null);
      return;
    }

    setValidatedWorkspaceDir(nextWorkspaceDir);
  }, [workspaceDir]);

  return validatedWorkspaceDir;
}
