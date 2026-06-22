import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useActiveStreamingMessageIds,
  useChatRetryByMessageId,
} from "@/features/agent/store/agent-store";
import { cn } from "@/lib/utils";
import { resolveContinuedSessionIdFromMessages } from "@/features/agent/handoff";
import type { MessageRecord } from "@/lib/db";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { MessageItem } from "./message-item";
import { SystemPromptBlock } from "./system-prompt-block";
import { HandoffContinuationBanner } from "./handoff-continuation-banner";
import { HandoffSourceBanner } from "./handoff-source-banner";

type MessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  handoffFromSessionId?: string | null;
  systemPrompt?: string | null;
  onSystemPromptExpand?: () => void;
  editingMessageId?: string | null;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
};

const NEAR_BOTTOM_THRESHOLD_PX = 80;
const ESTIMATED_MESSAGE_HEIGHT_PX = 220;
const MESSAGE_OVERSCAN = 4;
const ESTIMATED_ITEM_SIZE = () => ESTIMATED_MESSAGE_HEIGHT_PX;

function getScrollViewport(container: HTMLElement): HTMLElement | null {
  const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');
  return viewport instanceof HTMLElement ? viewport : null;
}

function isNearBottom(viewport: HTMLElement): boolean {
  const distanceFromBottom =
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

  return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
}

export function MessageList({
  messages,
  sessionTitle,
  handoffFromSessionId,
  systemPrompt,
  onSystemPromptExpand,
  editingMessageId,
  onEditUserMessage,
  onRegenerateAssistantMessage,
}: MessageListProps) {
  const { t } = useTranslation();
  const streamingMessageIds = useActiveStreamingMessageIds();
  const chatRetryByMessageId = useChatRetryByMessageId();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(null);
  const previousMessageCountRef = useRef(messages.length);
  const isPinnedToBottomRef = useRef(true);
  const isStreamingRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const sessionId = messages[0]?.sessionId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const scrollViewportRef = useRef(scrollViewport);
  scrollViewportRef.current = scrollViewport;

  // Stable callbacks for useVirtualizer options — avoids re-creation on every render.
  const getItemKey = useCallback(
    (index: number) => messagesRef.current[index]?.id ?? index,
    []
  );
  const getScrollElement = useCallback(() => scrollViewportRef.current, []);

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: ESTIMATED_ITEM_SIZE,
    getItemKey,
    getScrollElement,
    overscan: MESSAGE_OVERSCAN,
  });

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      if (messagesRef.current.length === 0) {
        return;
      }

      rowVirtualizer.scrollToIndex(messagesRef.current.length - 1, {
        align: "end",
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [rowVirtualizer]
  );
  const handoffContinuedSessionId = useMemo(
    () =>
      handoffFromSessionId
        ? null
        : resolveContinuedSessionIdFromMessages(messages),
    [handoffFromSessionId, messages]
  );

  // Detect the build-from-plan boundary so a visual separator can be
  // inserted between the planning conversation and the build phase.
  const buildBoundaryIndex = useMemo(() => {
    const BUILD_PROMPT_MARKER = "implement the following plan";
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (
        message.role === "user" &&
        message.content.includes(BUILD_PROMPT_MARKER)
      ) {
        return i;
      }
    }
    return -1;
  }, [messages]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const viewport = getScrollViewport(container);
    setScrollViewport((currentViewport) =>
      currentViewport === viewport ? currentViewport : viewport
    );
  }, []);

  useEffect(() => {
    isPinnedToBottomRef.current = true;
    previousMessageCountRef.current = messages.length;
  }, [sessionId]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const handleScroll = () => {
      const wasPinned = isPinnedToBottomRef.current;
      const pinned = isNearBottom(scrollViewport);
      isPinnedToBottomRef.current = pinned;

      if (!wasPinned && pinned && isStreamingRef.current) {
        scrollToBottom(false);
      }
    };

    scrollViewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollViewport.removeEventListener("scroll", handleScroll);
    };
  }, [scrollToBottom, scrollViewport]);

  useEffect(() => {
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
      scrollToBottom(didAppendMessage && !isStreaming);
    });

    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages, scrollToBottom, streamingMessageIds]);

  // Listen for custom DOM event dispatched from the title bar.
  useEffect(() => {
    const handler = () => {
      isPinnedToBottomRef.current = true;
      scrollToBottom(true);
    };
    window.addEventListener("chat:scroll-to-bottom", handler);
    return () => {
      window.removeEventListener("chat:scroll-to-bottom", handler);
    };
  }, [scrollToBottom]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="h-full px-4 py-6 [&_[data-slot=scroll-area-viewport]]:[will-change:transform]">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {systemPrompt ? (
            <SystemPromptBlock
              content={systemPrompt}
              onExpand={onSystemPromptExpand}
            />
          ) : null}
          {handoffFromSessionId ? (
            <HandoffContinuationBanner fromSessionId={handoffFromSessionId} />
          ) : null}
          {handoffContinuedSessionId ? (
            <HandoffSourceBanner continuedSessionId={handoffContinuedSessionId} />
          ) : null}
          {messages.length > 0 ? (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map((virtualItem) => {
                const index = virtualItem.index;
                const message = messages[index];
                if (!message) {
                  return null;
                }

                return (
                  <div
                    data-index={index}
                    key={virtualItem.key}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      left: 0,
                      position: "absolute",
                      top: 0,
                      transform: `translateY(${virtualItem.start}px) translateZ(0)`,
                      width: "100%",
                      willChange: "transform",
                    }}
                  >
                    <div
                      className={cn(
                        "flex flex-col gap-6",
                        index < messages.length - 1 ? "pb-6" : null
                      )}
                    >
                      {buildBoundaryIndex > 0 && index === buildBoundaryIndex ? (
                        <div className="-mx-4 flex items-center gap-3 px-4">
                          <Separator className="flex-1" />
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {t("chat.planBuildStart")}
                          </span>
                          <Separator className="flex-1" />
                        </div>
                      ) : null}
                      <MessageItem
                        chatRetry={chatRetryByMessageId.get(message.id) ?? null}
                        editingMessageId={editingMessageId}
                        handoffFromSessionId={handoffFromSessionId}
                        isStreaming={streamingMessageIds.has(message.id)}
                        message={message}
                        onEditUserMessage={onEditUserMessage}
                        onRegenerateAssistantMessage={onRegenerateAssistantMessage}
                        sessionTitle={sessionTitle}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
