import { useMatch } from "react-router-dom";

import { useTranslation } from "@/lib/i18n/locale-provider";

import { useSessionMessages } from "../hooks/use-session-messages";
import { SessionToolbar } from "./session-toolbar";

export function SessionHeader() {
  const { t } = useTranslation();
  const chatMatch = useMatch("/chat/:chatId");
  const chatId =
    chatMatch?.params.chatId && chatMatch.params.chatId !== "new"
      ? chatMatch.params.chatId
      : null;
  const { session } = useSessionMessages(chatId ?? "");

  const title =
    chatId == null
      ? t("session.newChat")
      : session?.title ?? t("session.newChat");

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <h1 className="truncate text-sm font-medium">{title}</h1>
      <SessionToolbar />
    </header>
  );
}
