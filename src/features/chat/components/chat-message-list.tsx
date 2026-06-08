import type { MessageRecord } from "@/lib/db";

import { useDisplayMessages } from "../hooks/use-session-messages";
import { MessageList } from "./message-list";

type ChatMessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  systemPrompt?: string | null;
  editingMessageId?: string | null;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
};

export function ChatMessageList({
  messages,
  sessionTitle,
  systemPrompt,
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
      systemPrompt={systemPrompt}
    />
  );
}
