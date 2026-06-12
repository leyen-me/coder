import { useCallback } from "react";

import { checkoutGitBranch } from "@/features/workspace/git";
import { readWorkspaceDir } from "@/features/workspace/storage";
import { useValidatedWorkspaceDir } from "@/features/workspace/use-validated-workspace-dir";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { updateSession, type SessionRecord } from "@/lib/db";

type UseSessionWorkspaceBindingInput = {
  session: SessionRecord | null;
  canEdit: boolean;
};

export function useSessionWorkspaceBinding({
  session,
  canEdit,
}: UseSessionWorkspaceBindingInput) {
  const {
    workspaceDir: globalWorkspaceDir,
    pickWorkspace,
    setWorkspaceDir,
  } = useWorkspace();

  const effectiveWorkspaceDir = useValidatedWorkspaceDir(
    session?.workspaceDir?.trim() || globalWorkspaceDir
  );

  const handlePickWorkspace = useCallback(async () => {
    if (!canEdit) {
      return;
    }

    const selected = await pickWorkspace();
    if (!selected || !session) {
      return;
    }

    await updateSession(session.id, {
      workspaceDir: selected,
    });
  }, [canEdit, pickWorkspace, session]);

  const handleClearWorkspace = useCallback(async () => {
    if (!canEdit) {
      return;
    }

    setWorkspaceDir(null);
    if (session) {
      await updateSession(session.id, {
        workspaceDir: null,
      });
    }
  }, [canEdit, session, setWorkspaceDir]);

  const handleBranchChange = useCallback(
    async (branch: string) => {
      if (!canEdit || !effectiveWorkspaceDir?.trim()) {
        return;
      }

      await checkoutGitBranch(effectiveWorkspaceDir.trim(), branch);
    },
    [canEdit, effectiveWorkspaceDir]
  );

  return {
    workspaceDir: effectiveWorkspaceDir,
    handlePickWorkspace,
    handleClearWorkspace,
    handleBranchChange,
  };
}

/** Workspace shown on the new-chat page before a session exists. */
export function useNewChatWorkspace() {
  const { workspaceDir, pickWorkspace, setWorkspaceDir } = useWorkspace();
  const validatedWorkspaceDir = useValidatedWorkspaceDir(
    workspaceDir ?? readWorkspaceDir()
  );

  return {
    workspaceDir: validatedWorkspaceDir,
    pickWorkspace,
    clearWorkspace: () => setWorkspaceDir(null),
  };
}
