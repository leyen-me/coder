import type { MessageRecord } from "@/lib/db";

import { useDisplayMessages } from "../hooks/use-session-messages";
import { MessageList } from "./message-list";

type ChatMessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  editingMessageId?: string | null;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
};

export function ChatMessageList({
  messages,
  sessionTitle,
  editingMessageId,
  onEditUserMessage,
  onRegenerateAssistantMessage,
}: ChatMessageListProps) {
  const displayMessages = useDisplayMessages(messages);

  return (
    <MessageList
      editingMessageId={editingMessageId}
      messages={displayMessages}
      onEditUserMessage={onEditUserMessage}
      onRegenerateAssistantMessage={onRegenerateAssistantMessage}
      sessionTitle={sessionTitle}
    />
  );
}
