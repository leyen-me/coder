import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  useActiveStreamingMessageIds,
  useChatRetryByMessageId,
} from "@/features/agent/store/agent-store";
import { cn } from "@/lib/utils";
import { resolveContinuedSessionIdFromMessages } from "@/features/agent/handoff";
import type { MessageRecord } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { MessageItem } from "./message-item";
import {
  getDistanceFromBottom,
  isNearBottom,
  isUserScrollDownIntent,
  isUserScrollUpIntent,
  NEAR_BOTTOM_THRESHOLD_PX,
  shouldClearScrollPinSuppression,
  shouldFollowStream,
} from "./message-list-scroll";
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
  virtualScrollEnabled?: boolean;
};

const ESTIMATED_MESSAGE_HEIGHT_PX = 220;
const MESSAGE_OVERSCAN = 4;
const ESTIMATED_ITEM_SIZE = () => ESTIMATED_MESSAGE_HEIGHT_PX;

function getScrollViewport(container: HTMLElement): HTMLElement | null {
  const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');
  return viewport instanceof HTMLElement ? viewport : null;
}

function scrollViewportToBottom(
  viewport: HTMLElement | null,
  smooth: boolean,
  onProgrammaticScroll?: () => void
) {
  if (!viewport) {
    return;
  }

  onProgrammaticScroll?.();
  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
  // Some browsers/layouts apply scrollHeight after scrollTo; force the final position.
  if (!smooth) {
    viewport.scrollTop = viewport.scrollHeight;
  }
}

function findAnchorMessageIndex(
  viewport: HTMLElement,
  messages: readonly MessageRecord[]
): number {
  const viewportTop = viewport.getBoundingClientRect().top;

  for (const node of viewport.querySelectorAll("[data-message-id]")) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    const rect = node.getBoundingClientRect();
    if (rect.bottom <= viewportTop + NEAR_BOTTOM_THRESHOLD_PX) {
      continue;
    }

    const messageId = node.dataset.messageId;
    if (!messageId) {
      continue;
    }

    const index = messages.findIndex((message) => message.id === messageId);
    if (index >= 0) {
      return index;
    }
  }

  return 0;
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
  virtualScrollEnabled = false,
}: MessageListProps) {
  const { t } = useTranslation();
  const streamingMessageIds = useActiveStreamingMessageIds();
  const chatRetryByMessageId = useChatRetryByMessageId();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(null);
  const [isViewportNearBottom, setIsViewportNearBottom] = useState(true);
  const previousMessageCountRef = useRef(messages.length);
  const isPinnedToBottomRef = useRef(true);
  const isAutoScrollingRef = useRef(false);
  const suppressScrollPinUpdatesRef = useRef(false);
  const isStreamingRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);
  const sessionId = messages[0]?.sessionId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const scrollViewportRef = useRef(scrollViewport);
  scrollViewportRef.current = scrollViewport;
  const streamingMessageCount = useMemo(
    () => messages.filter((message) => streamingMessageIds.has(message.id)).length,
    [messages, streamingMessageIds]
  );
  const isStreaming = streamingMessageCount > 0;
  const shouldVirtualize = virtualScrollEnabled && !isStreaming;
  const pendingVirtualizationAnchorRef = useRef<number | null>(null);
  const wasStreamingRef = useRef(isStreaming);

  if (
    wasStreamingRef.current &&
    !isStreaming &&
    virtualScrollEnabled &&
    scrollViewport &&
    !isPinnedToBottomRef.current
  ) {
    pendingVirtualizationAnchorRef.current = findAnchorMessageIndex(
      scrollViewport,
      messages
    );
  }
  wasStreamingRef.current = isStreaming;

  const lastMessage = messages.at(-1);
  const lastMessageSignature = lastMessage
    ? [
        lastMessage.id,
        lastMessage.role,
        lastMessage.status,
        lastMessage.content.length,
        lastMessage.thinking.length,
      ].join(":")
    : "";

  // Stable callbacks for useVirtualizer options — avoids re-creation on every render.
  const getItemKey = useCallback(
    (index: number) => messagesRef.current[index]?.id ?? index,
    []
  );
  const getScrollElement = useCallback(() => scrollViewportRef.current, []);

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? messages.length : 0,
    estimateSize: ESTIMATED_ITEM_SIZE,
    getItemKey,
    getScrollElement,
    overscan: MESSAGE_OVERSCAN,
  });

  const markProgrammaticScroll = useCallback((smooth: boolean) => {
    isAutoScrollingRef.current = true;

    const clearAutoScrolling = () => {
      isAutoScrollingRef.current = false;
    };

    const viewport = scrollViewportRef.current;
    if (smooth && viewport) {
      viewport.addEventListener("scrollend", clearAutoScrolling, { once: true });
      window.setTimeout(clearAutoScrolling, 500);
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(clearAutoScrolling);
    });
  }, []);

  const setPinnedToBottom = useCallback((pinned: boolean) => {
    isPinnedToBottomRef.current = pinned;
  }, []);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      if (messagesRef.current.length === 0) {
        return;
      }

      if (isPinnedToBottomRef.current) {
        suppressScrollPinUpdatesRef.current = true;
      }

      if (shouldVirtualize) {
        markProgrammaticScroll(smooth);
        rowVirtualizer.scrollToIndex(messagesRef.current.length - 1, {
          align: "end",
          behavior: smooth ? "smooth" : "auto",
        });
      } else {
        scrollViewportToBottom(
          scrollViewportRef.current,
          smooth,
          () => markProgrammaticScroll(smooth)
        );
      }
    },
    [markProgrammaticScroll, rowVirtualizer, shouldVirtualize]
  );

  const resumeFollowingStream = useCallback(
    (smooth: boolean) => {
      setPinnedToBottom(true);
      suppressScrollPinUpdatesRef.current = true;
      scrollToBottom(smooth);

      const viewport = scrollViewportRef.current;
      if (!viewport) {
        return;
      }

      const syncNearBottom = () => {
        setIsViewportNearBottom(isNearBottom(viewport));
      };

      syncNearBottom();
      requestAnimationFrame(syncNearBottom);
    },
    [scrollToBottom, setPinnedToBottom]
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
    setPinnedToBottom(true);
    setIsViewportNearBottom(true);
    previousMessageCountRef.current = messages.length;
  }, [sessionId, setPinnedToBottom]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const handleScroll = () => {
      const nearBottom = isNearBottom(scrollViewport);
      setIsViewportNearBottom(nearBottom);

      if (isAutoScrollingRef.current) {
        return;
      }

      const distanceFromBottom = getDistanceFromBottom(scrollViewport);
      if (
        suppressScrollPinUpdatesRef.current &&
        shouldClearScrollPinSuppression(distanceFromBottom)
      ) {
        suppressScrollPinUpdatesRef.current = false;
      }

      if (suppressScrollPinUpdatesRef.current) {
        return;
      }

      setPinnedToBottom(nearBottom);
    };

    const handleWheel = (event: WheelEvent) => {
      if (isUserScrollUpIntent(event.deltaY)) {
        suppressScrollPinUpdatesRef.current = false;
        setPinnedToBottom(false);
        return;
      }

      if (
        isUserScrollDownIntent(event.deltaY) &&
        isNearBottom(scrollViewport)
      ) {
        setPinnedToBottom(true);
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touchStartY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (touchStartY === null || currentY === undefined) {
        return;
      }

      if (currentY > touchStartY + NEAR_BOTTOM_THRESHOLD_PX / 4) {
        suppressScrollPinUpdatesRef.current = false;
        setPinnedToBottom(false);
      }
    };

    scrollViewport.addEventListener("scroll", handleScroll, { passive: true });
    scrollViewport.addEventListener("wheel", handleWheel, { passive: true });
    scrollViewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    scrollViewport.addEventListener("touchmove", handleTouchMove, {
      passive: true,
    });

    return () => {
      scrollViewport.removeEventListener("scroll", handleScroll);
      scrollViewport.removeEventListener("wheel", handleWheel);
      scrollViewport.removeEventListener("touchstart", handleTouchStart);
      scrollViewport.removeEventListener("touchmove", handleTouchMove);
    };
  }, [scrollViewport, setPinnedToBottom]);

  useLayoutEffect(() => {
    if (!shouldVirtualize || pendingVirtualizationAnchorRef.current === null) {
      return;
    }

    const anchorIndex = pendingVirtualizationAnchorRef.current;
    pendingVirtualizationAnchorRef.current = null;
    rowVirtualizer.scrollToIndex(anchorIndex, { align: "start" });
  }, [rowVirtualizer, shouldVirtualize]);

  useLayoutEffect(() => {
    isStreamingRef.current = isStreaming;

    const didAppendMessage = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    const userJustSent = didAppendMessage && lastMessage?.role === "user";

    if (userJustSent) {
      setPinnedToBottom(true);
    }

    if (
      !shouldFollowStream({
        isPinnedToBottom: isPinnedToBottomRef.current,
        userJustSent,
      })
    ) {
      return;
    }

    scrollToBottom(didAppendMessage && !isStreaming);
  }, [
    isStreaming,
    lastMessage?.role,
    lastMessageSignature,
    messages.length,
    scrollToBottom,
    setPinnedToBottom,
  ]);

  // Listen for custom DOM event dispatched from the title bar.
  useEffect(() => {
    const handler = () => {
      resumeFollowingStream(!isStreamingRef.current);
    };
    window.addEventListener("chat:scroll-to-bottom", handler);
    return () => {
      window.removeEventListener("chat:scroll-to-bottom", handler);
    };
  }, [resumeFollowingStream]);

  const showScrollToLatest = isStreaming && !isViewportNearBottom;

  const handleScrollToLatest = useCallback(() => {
    resumeFollowingStream(false);
  }, [resumeFollowingStream]);

  const renderBuildBoundarySeparator = (index: number) => {
    if (buildBoundaryIndex > 0 && index === buildBoundaryIndex) {
      return (
        <div className="-mx-4 flex items-center gap-3 px-4">
          <Separator className="flex-1" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t("chat.planBuildStart")}
          </span>
          <Separator className="flex-1" />
        </div>
      );
    }
    return null;
  };

  const renderMessage = (message: MessageRecord) => (
    <div data-message-id={message.id}>
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
  );

  const virtualItems = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];

  return (
    <div
      ref={scrollContainerRef}
      className="relative min-h-0 flex-1 overflow-hidden"
    >
      <ScrollArea
        className={cn(
          "h-full px-3 py-4 md:px-4 md:py-6",
          shouldVirtualize &&
            "**:data-[slot=scroll-area-viewport]:will-change-transform"
        )}
      >
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

          {shouldVirtualize ? (
            /* ── Virtualized rendering ── */
            messages.length > 0 ? (
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
                        {renderBuildBoundarySeparator(index)}
                        {renderMessage(message)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null
          ) : (
            /* ── Simple (non-virtualized) rendering ── */
            messages.map((message, index) => (
              <Fragment key={message.id}>
                {renderBuildBoundarySeparator(index)}
                {renderMessage(message)}
              </Fragment>
            ))
          )}
        </div>
      </ScrollArea>

      {showScrollToLatest ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <Button
            aria-label={t("chat.scrollToLatest")}
            className="pointer-events-auto h-8 rounded-full px-3 shadow-md"
            onClick={handleScrollToLatest}
            size="sm"
            type="button"
            variant="secondary"
          >
            <ArrowDownIcon className="size-4" />
            {t("chat.scrollToLatest")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
