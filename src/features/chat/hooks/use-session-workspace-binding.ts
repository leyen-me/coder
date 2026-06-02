import { useCallback } from "react";

import { checkoutGitBranch } from "@/features/workspace/git";
import { readWorkspaceDir } from "@/features/workspace/storage";
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
  const { workspaceDir: globalWorkspaceDir, pickWorkspace } = useWorkspace();

  const effectiveWorkspaceDir =
    session?.workspaceDir?.trim() || globalWorkspaceDir;

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
    handleBranchChange,
  };
}

/** Workspace shown on the new-chat page before a session exists. */
export function useNewChatWorkspace() {
  const { workspaceDir, pickWorkspace } = useWorkspace();
  return {
    workspaceDir: workspaceDir ?? readWorkspaceDir(),
    pickWorkspace,
  };
}
