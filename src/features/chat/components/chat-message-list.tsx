import type { MessageRecord } from "@/lib/db";

import { useDisplayMessages } from "../hooks/use-session-messages";
import { MessageList } from "./message-list";

type ChatMessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  onEditUserMessage?: (message: MessageRecord) => void;
};

export function ChatMessageList({
  messages,
  sessionTitle,
  onEditUserMessage,
}: ChatMessageListProps) {
  const displayMessages = useDisplayMessages(messages);

  return (
    <MessageList
      messages={displayMessages}
      onEditUserMessage={onEditUserMessage}
      sessionTitle={sessionTitle}
    />
  );
}
