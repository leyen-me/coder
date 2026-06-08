import { useEffect, useRef } from "react";

import { useActiveStreamingMessageIds } from "@/features/agent/store/agent-store";
import type { MessageRecord } from "@/lib/db";
import { ScrollArea } from "@/components/ui/scroll-area";

import { MessageItem } from "./message-item";
import { SystemPromptBlock } from "./system-prompt-block";

type MessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  systemPrompt?: string | null;
  editingMessageId?: string | null;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
};

const NEAR_BOTTOM_THRESHOLD_PX = 80;

function getScrollViewport(container: HTMLElement): HTMLElement | null {
  const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');
  return viewport instanceof HTMLElement ? viewport : null;
}

function isNearBottom(viewport: HTMLElement): boolean {
  const distanceFromBottom =
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

  return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
}

function scrollMessagesToBottom(container: HTMLElement, smooth: boolean) {
  const viewport = getScrollViewport(container);
  if (!viewport) {
    return;
  }

  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

export function MessageList({
  messages,
  sessionTitle,
  systemPrompt,
  editingMessageId,
  onEditUserMessage,
  onRegenerateAssistantMessage,
}: MessageListProps) {
  const streamingMessageIds = useActiveStreamingMessageIds();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);
  const isPinnedToBottomRef = useRef(true);
  const isStreamingRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const sessionId = messages[0]?.sessionId;

  useEffect(() => {
    isPinnedToBottomRef.current = true;
    previousMessageCountRef.current = messages.length;
  }, [sessionId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const viewport = getScrollViewport(container);
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const wasPinned = isPinnedToBottomRef.current;
      const pinned = isNearBottom(viewport);
      isPinnedToBottomRef.current = pinned;

      if (!wasPinned && pinned && isStreamingRef.current) {
        scrollMessagesToBottom(container, false);
      }
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const isStreaming = messages.some((message) =>
      streamingMessageIds.has(message.id)
    );
    isStreamingRef.current = isStreaming;

    const didAppendMessage = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    const lastMessage = messages.at(-1);
    const userJustSent = didAppendMessage && lastMessage?.role === "user";

    if (userJustSent) {
      isPinnedToBottomRef.current = true;
    }

    if (!isPinnedToBottomRef.current && !userJustSent) {
      return;
    }

    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      scrollMessagesToBottom(container, didAppendMessage && !isStreaming);
    });

    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages, streamingMessageIds]);

  return (
    <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="h-full px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {systemPrompt ? (
            <SystemPromptBlock content={systemPrompt} />
          ) : null}
          {messages.map((message) => (
            <MessageItem
              editingMessageId={editingMessageId}
              isStreaming={streamingMessageIds.has(message.id)}
              key={message.id}
              message={message}
              onEditUserMessage={onEditUserMessage}
              onRegenerateAssistantMessage={onRegenerateAssistantMessage}
              sessionTitle={sessionTitle}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
