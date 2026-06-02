import { useEffect, useRef } from "react";

import type { MessageRecord } from "@/lib/db";
import { ScrollArea } from "@/components/ui/scroll-area";

import { MessageItem } from "./message-item";

type MessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
};

function scrollMessagesToBottom(container: HTMLElement, smooth: boolean) {
  const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');
  if (!(viewport instanceof HTMLElement)) {
    return;
  }

  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

export function MessageList({ messages, sessionTitle }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const isStreaming = messages.some(
      (message) =>
        message.status === "pending" || message.status === "streaming"
    );
    const didAppendMessage = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    scrollMessagesToBottom(container, didAppendMessage && !isStreaming);
  }, [messages]);

  return (
    <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="h-full px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              sessionTitle={sessionTitle}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
