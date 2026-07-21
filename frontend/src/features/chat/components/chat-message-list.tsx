import type { MessageRecord } from "@/lib/db";

import { MessageList } from "./message-list";

import type { SessionCompactUiState } from "../lib/session-compact-ui-store";

type ChatMessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  systemPrompt?: string | null;
  compactUi?: SessionCompactUiState | null;
  handoffFromSessionId?: string | null;
  onSystemPromptExpand?: () => void;
  editingMessageId?: string | null;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
};

export function ChatMessageList({
  messages,
  sessionTitle,
  systemPrompt,
  compactUi,
  handoffFromSessionId,
  onSystemPromptExpand,
  editingMessageId,
  onEditUserMessage,
  onRegenerateAssistantMessage,
}: ChatMessageListProps) {
  return (
    <MessageList
      compactUi={compactUi}
      editingMessageId={editingMessageId}
      handoffFromSessionId={handoffFromSessionId}
      messages={messages}
      onEditUserMessage={onEditUserMessage}
      onRegenerateAssistantMessage={onRegenerateAssistantMessage}
      onSystemPromptExpand={onSystemPromptExpand}
      sessionTitle={sessionTitle}
      systemPrompt={systemPrompt}
    />
  );
}
