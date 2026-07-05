import { useCallback } from "react";
import { useMatch } from "react-router-dom";

import { isChatRoute, paths } from "@/app/paths";
import { useIsSessionTitleGenerating } from "@/features/agent/session-title-store";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { SessionTitleLabel } from "../components/session-title-label";
import { SessionToolbar } from "../components/session-toolbar";
import { useSessionMessages } from "./use-session-messages";

export function useSessionTitleBarSlots(pathname: string) {
  const { t } = useTranslation();
  const chatMatch = useMatch("/chat/:chatId");
  const chatId =
    chatMatch?.params.chatId && chatMatch.params.chatId !== "new"
      ? chatMatch.params.chatId
      : null;
  const { session } = useSessionMessages(chatId ?? "");
  const { workspaceDir: globalWorkspaceDir } = useWorkspace();
  const workspaceDir = session?.workspaceDir?.trim() || globalWorkspaceDir;
  const isGeneratingTitle = useIsSessionTitleGenerating(chatId);
  const handleDoubleClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent("chat:scroll-to-bottom"));
  }, []);

  if (pathname === paths.skills) {
    return {
      leading: (
        <h1 className="truncate text-sm font-medium">{t("pages.skills.title")}</h1>
      ),
      trailing: null,
    };
  }

  if (!isChatRoute(pathname)) {
    return null;
  }

  const title =
    chatId == null
      ? t("session.newChat")
      : session?.title ?? t("session.newChat");

  return {
    leading: (
      <SessionTitleLabel
        title={title}
        sessionKind={session?.sessionKind ?? "standard"}
        isGenerating={isGeneratingTitle}
        variant="header"
        onDoubleClick={handleDoubleClick}
      />
    ),
    trailing: (
      <SessionToolbar
        sessionProvider={session?.provider ?? null}
        workspaceDir={workspaceDir}
      />
    ),
  };
}
