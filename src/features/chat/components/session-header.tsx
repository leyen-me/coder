import { useMatch } from "react-router-dom";

import { useIsSessionTitleGenerating } from "@/features/agent/session-title-store";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useSessionMessages } from "../hooks/use-session-messages";
import { SessionTitleLabel } from "./session-title-label";
import { SessionToolbar } from "./session-toolbar";

export function SessionHeader() {
  const { t } = useTranslation();
  const chatMatch = useMatch("/chat/:chatId");
  const chatId =
    chatMatch?.params.chatId && chatMatch.params.chatId !== "new"
      ? chatMatch.params.chatId
      : null;
  const { session } = useSessionMessages(chatId ?? "");
  const isGeneratingTitle = useIsSessionTitleGenerating(chatId);

  const title =
    chatId == null
      ? t("session.newChat")
      : session?.title ?? t("session.newChat");

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <SessionTitleLabel
        title={title}
        isGenerating={isGeneratingTitle}
        variant="header"
      />
      <SessionToolbar />
    </header>
  );
}
