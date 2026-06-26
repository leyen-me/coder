import type { MessageRecord } from "@/lib/db";

import { useLabSettings } from "@/features/lab/use-lab-settings";
import { MessageList } from "./message-list";

type ChatMessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  handoffFromSessionId?: string | null;
  systemPrompt?: string | null;
  onSystemPromptExpand?: () => void;
  editingMessageId?: string | null;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
};

export function ChatMessageList({
  messages,
  sessionTitle,
  handoffFromSessionId,
  systemPrompt,
  onSystemPromptExpand,
  editingMessageId,
  onEditUserMessage,
  onRegenerateAssistantMessage,
}: ChatMessageListProps) {
  const { settings } = useLabSettings();

  return (
    <MessageList
      editingMessageId={editingMessageId}
      handoffFromSessionId={handoffFromSessionId}
      messages={messages}
      onEditUserMessage={onEditUserMessage}
      onRegenerateAssistantMessage={onRegenerateAssistantMessage}
      onSystemPromptExpand={onSystemPromptExpand}
      sessionTitle={sessionTitle}
      systemPrompt={systemPrompt}
      virtualScrollEnabled={settings.virtualScrollEnabled}
    />
  );
}
