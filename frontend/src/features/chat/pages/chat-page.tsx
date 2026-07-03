import { useLocation, useParams } from "react-router-dom";

import { paths } from "@/app/paths";

import { ChatSessionView } from "../views/chat-session-view";
import { NewChatView } from "../views/new-chat-view";

export function ChatPage() {
  const { pathname } = useLocation();
  const { chatId } = useParams<{ chatId: string }>();

  if (pathname === paths.chatNew) {
    return <NewChatView />;
  }

  return <ChatSessionView key={chatId} chatId={chatId ?? ""} />;
}
