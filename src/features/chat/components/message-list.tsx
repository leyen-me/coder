import { useEffect, useRef } from "react";

import type { MessageRecord } from "@/lib/db";
import { ScrollArea } from "@/components/ui/scroll-area";

import { MessageItem } from "./message-item";

type MessageListProps = {
  messages: MessageRecord[];
};

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <ScrollArea className="min-h-0 flex-1 px-4 py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
