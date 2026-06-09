import { useLocation, useMatch } from "react-router-dom";

import { paths } from "@/app/paths";
import { useSessionMessages } from "@/features/chat/hooks/use-session-messages";
import { readWorkspaceDir } from "@/features/workspace/storage";
import { useWorkspace } from "@/features/workspace/workspace-provider";

/** Workspace used when creating new terminal sessions for the current route. */
export function useRouteWorkspaceDir(): string | null {
  const { pathname } = useLocation();
  const chatMatch = useMatch("/chat/:chatId");
  const chatId =
    chatMatch?.params.chatId && chatMatch.params.chatId !== "new"
      ? chatMatch.params.chatId
      : null;
  const { session } = useSessionMessages(chatId ?? "");
  const { workspaceDir: globalWorkspaceDir } = useWorkspace();

  if (pathname === paths.chatNew) {
    return globalWorkspaceDir ?? readWorkspaceDir();
  }

  if (chatId) {
    return (
      session?.workspaceDir?.trim() ||
      globalWorkspaceDir ||
      readWorkspaceDir()
    );
  }

  return globalWorkspaceDir ?? readWorkspaceDir();
}
