import { useMemo } from "react";
import { useLocation, useMatch } from "react-router-dom";

import { paths } from "@/app/paths";
import { useSessionMessages } from "@/features/chat/hooks/use-session-messages";
import { readWorkspaceDir } from "@/features/workspace/storage";
import { useValidatedWorkspaceDir } from "@/features/workspace/use-validated-workspace-dir";
import { useWorkspace } from "@/features/workspace/workspace-provider";

/** Workspace used when creating new terminal sessions for the current route. */
export function useRouteWorkspaceDir(): string | null {
  const { pathname } = useLocation();
  const chatMatch = useMatch("/chat/:chatId");
  const chatId =
    chatMatch?.params.chatId && chatMatch.params.chatId !== "new"
      ? chatMatch.params.chatId
      : null;
  const { session, isLoading } = useSessionMessages(chatId ?? "");
  const { workspaceDir: globalWorkspaceDir } = useWorkspace();

  const candidateWorkspaceDir = useMemo(() => {
    if (pathname === paths.chatNew) {
      return globalWorkspaceDir ?? readWorkspaceDir();
    }

    if (chatId) {
      // Avoid falling back to a stale persisted workspace while the next session loads.
      if (isLoading) {
        return null;
      }

      return session?.workspaceDir?.trim() || globalWorkspaceDir || null;
    }

    return globalWorkspaceDir ?? readWorkspaceDir();
  }, [chatId, globalWorkspaceDir, isLoading, pathname, session?.workspaceDir]);

  return useValidatedWorkspaceDir(candidateWorkspaceDir);
}
