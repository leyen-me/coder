import type { MessageRecord } from "@/lib/db";

import { useDisplayMessages } from "../hooks/use-session-messages";
import { MessageList } from "./message-list";

type ChatMessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
};

export function ChatMessageList({
  messages,
  sessionTitle,
}: ChatMessageListProps) {
  const displayMessages = useDisplayMessages(messages);

  return (
    <MessageList messages={displayMessages} sessionTitle={sessionTitle} />
  );
}
