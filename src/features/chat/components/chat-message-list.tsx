import type { MessageRecord } from "@/lib/db";

import { useDisplayMessages } from "../hooks/use-session-messages";
import { MessageList } from "./message-list";

type ChatMessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  systemPrompt?: string | null;
  onSystemPromptExpand?: () => void;
  editingMessageId?: string | null;
  latestPlanMessageId?: string | null;
  isBuildPending?: boolean;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
  onBuildFromPlan?: (planContent: string) => void;
};

export function ChatMessageList({
  messages,
  sessionTitle,
  systemPrompt,
  onSystemPromptExpand,
  editingMessageId,
  latestPlanMessageId,
  isBuildPending = false,
  onEditUserMessage,
  onRegenerateAssistantMessage,
  onBuildFromPlan,
}: ChatMessageListProps) {
  const displayMessages = useDisplayMessages(messages);

  return (
    <MessageList
      editingMessageId={editingMessageId}
      isBuildPending={isBuildPending}
      latestPlanMessageId={latestPlanMessageId}
      messages={displayMessages}
      onBuildFromPlan={onBuildFromPlan}
      onEditUserMessage={onEditUserMessage}
      onRegenerateAssistantMessage={onRegenerateAssistantMessage}
      onSystemPromptExpand={onSystemPromptExpand}
      sessionTitle={sessionTitle}
      systemPrompt={systemPrompt}
    />
  );
}
