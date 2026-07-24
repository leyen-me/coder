import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  useActiveStreamingMessageIds,
  useChatRetryByMessageId,
} from "@/features/agent/store/agent-store";
import { cn } from "@/lib/utils";
import type { MessageRecord } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { MessageItem } from "./message-item";
import {
  CHAT_SCROLL_RETRY_MS,
  CHAT_SCROLL_TO_BOTTOM_EVENT,
  didAppendUserMessage,
  getDistanceFromBottom,
  isNearBottom,
  isUserScrollDownIntent,
  isUserScrollUpIntent,
  NEAR_BOTTOM_THRESHOLD_PX,
  shouldClearScrollPinSuppression,
  shouldFollowStream,
} from "./message-list-scroll";
import { SystemPromptBlock } from "./system-prompt-block";
import {
  CompactBoundaryBanner,
} from "./compact-separator";
import {
  hasCompactBoundary,
  resolveCompactBoundaryRenders,
} from "../lib/resolve-compact-boundary";
import type { SessionCompactUiState } from "../lib/session-compact-ui-store";

type MessageListProps = {
  messages: MessageRecord[];
  sessionTitle?: string;
  systemPrompt?: string | null;
  compactUi?: SessionCompactUiState | null;
  onSystemPromptExpand?: () => void;
  editingMessageId?: string | null;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
};

const ESTIMATED_MESSAGE_HEIGHT_PX = 220;
const MESSAGE_OVERSCAN = 4;
const ESTIMATED_ITEM_SIZE = () => ESTIMATED_MESSAGE_HEIGHT_PX;

function getScrollViewport(container: HTMLElement): HTMLElement | null {
  const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');
  return viewport instanceof HTMLElement ? viewport : null;
}

function resolveScrollViewport(
  scrollViewport: HTMLElement | null,
  scrollContainer: HTMLElement | null
): HTMLElement | null {
  if (scrollViewport) {
    return scrollViewport;
  }

  return scrollContainer ? getScrollViewport(scrollContainer) : null;
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
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
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
  systemPrompt,
  compactUi = null,
  onSystemPromptExpand,
  editingMessageId,
  onEditUserMessage,
  onRegenerateAssistantMessage,
}: MessageListProps) {
  const { t } = useTranslation();
  const streamingMessageIds = useActiveStreamingMessageIds();
  const chatRetryByMessageId = useChatRetryByMessageId();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<HTMLDivElement>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(null);
  const [virtualListScrollMargin, setVirtualListScrollMargin] = useState(0);
  const [isViewportNearBottom, setIsViewportNearBottom] = useState(true);
  const previousMessageCountRef = useRef(messages.length);
  const isPinnedToBottomRef = useRef(true);
  const isAutoScrollingRef = useRef(false);
  const suppressScrollPinUpdatesRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);
  const sessionId = messages[0]?.sessionId;
  const timelineMessages = useMemo(
    () => messages.filter((message) => message.messageKind !== "compact"),
    [messages],
  );
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const timelineMessagesRef = useRef(timelineMessages);
  timelineMessagesRef.current = timelineMessages;
  const scrollViewportRef = useRef(scrollViewport);
  scrollViewportRef.current = scrollViewport;
  const streamingMessageCount = useMemo(
    () => messages.filter((message) => streamingMessageIds.has(message.id)).length,
    [messages, streamingMessageIds]
  );
  const isStreaming = streamingMessageCount > 0;
  const compactBoundaries = useMemo(
    () => resolveCompactBoundaryRenders(messages, compactUi),
    [compactUi, messages],
  );
  const compactBoundaryByMessageId = useMemo(() => {
    const map = new Map<string, (typeof compactBoundaries)[number]>();
    for (const boundary of compactBoundaries) {
      map.set(boundary.afterMessageId, boundary);
    }
    return map;
  }, [compactBoundaries]);
  const shouldVirtualize =
    !isStreaming && !hasCompactBoundary(messages, compactUi);
  const pendingVirtualizationAnchorRef = useRef<number | null>(null);
  const wasStreamingRef = useRef(isStreaming);

  if (
    wasStreamingRef.current &&
    !isStreaming &&
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
    (index: number) => timelineMessagesRef.current[index]?.id ?? index,
    []
  );
  const getScrollElement = useCallback(() => scrollViewportRef.current, []);

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? timelineMessages.length : 0,
    estimateSize: ESTIMATED_ITEM_SIZE,
    getItemKey,
    getScrollElement,
    overscan: MESSAGE_OVERSCAN,
    scrollMargin: virtualListScrollMargin,
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

      // Always scroll the viewport directly. Virtual rows live inside the same
      // scroll container, so native scrollHeight is reliable — unlike
      // scrollToIndex, which fails when non-virtual content sits above the list.
      scrollViewportToBottom(
        resolveScrollViewport(
          scrollViewportRef.current,
          scrollContainerRef.current
        ),
        smooth,
        () => markProgrammaticScroll(smooth)
      );
    },
    [markProgrammaticScroll]
  );

  const resumeFollowingStream = useCallback(
    (smooth: boolean) => {
      setPinnedToBottom(true);
      suppressScrollPinUpdatesRef.current = true;
      scrollToBottom(smooth);

      const viewport = resolveScrollViewport(
        scrollViewportRef.current,
        scrollContainerRef.current
      );
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

  const scheduleScrollToBottom = useCallback(() => {
    resumeFollowingStream(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (isPinnedToBottomRef.current) {
          resumeFollowingStream(false);
        }
      });
    });

    window.setTimeout(() => {
      if (isPinnedToBottomRef.current) {
        resumeFollowingStream(false);
      }
    }, CHAT_SCROLL_RETRY_MS);
  }, [resumeFollowingStream]);

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

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const viewport = getScrollViewport(container);
    setScrollViewport((currentViewport) =>
      currentViewport === viewport ? currentViewport : viewport
    );
  }, []);

  // System prompt sits above the virtual list in the same scroll viewport. scrollMargin tells the virtualizer where the list starts.
  useLayoutEffect(() => {
    if (!shouldVirtualize) {
      setVirtualListScrollMargin(0);
      return;
    }

    const listElement = virtualListRef.current;
    const contentWrapper = listElement?.parentElement;
    if (!listElement || !contentWrapper) {
      return;
    }

    const measureScrollMargin = () => {
      setVirtualListScrollMargin((current) => {
        const next = listElement.offsetTop;
        return current === next ? current : next;
      });
    };

    measureScrollMargin();

    const resizeObserver = new ResizeObserver(measureScrollMargin);
    resizeObserver.observe(contentWrapper);
    for (const child of contentWrapper.children) {
      if (child !== listElement) {
        resizeObserver.observe(child);
      }
    }

    return () => resizeObserver.disconnect();
  }, [
    shouldVirtualize,
    systemPrompt,
  ]);

  useLayoutEffect(() => {
    setPinnedToBottom(true);
    setIsViewportNearBottom(true);
    previousMessageCountRef.current = messages.length;

    if (!sessionId || messages.length === 0) {
      return;
    }

    scheduleScrollToBottom();
  }, [sessionId, messages.length, scheduleScrollToBottom, setPinnedToBottom]);

  // Virtual list scroll margin and viewport readiness affect scrollHeight.
  useEffect(() => {
    if (!sessionId || messages.length === 0 || !isPinnedToBottomRef.current) {
      return;
    }

    scheduleScrollToBottom();
  }, [
    sessionId,
    messages.length,
    scrollViewport,
    virtualListScrollMargin,
    scheduleScrollToBottom,
  ]);

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
    const previousCount = previousMessageCountRef.current;
    const didAppendMessage = messages.length > previousCount;
    previousMessageCountRef.current = messages.length;

    const userJustSent = didAppendUserMessage(messages, previousCount);

    if (userJustSent) {
      scheduleScrollToBottom();
      return;
    }

    if (
      !shouldFollowStream({
        isPinnedToBottom: isPinnedToBottomRef.current,
        userJustSent: false,
      })
    ) {
      return;
    }

    scrollToBottom(didAppendMessage && !isStreaming);
  }, [
    isStreaming,
    lastMessageSignature,
    messages.length,
    resumeFollowingStream,
    scheduleScrollToBottom,
    scrollToBottom,
  ]);

  // Listen for custom DOM event dispatched from the title bar and send flow.
  useEffect(() => {
    const handler = () => {
      scheduleScrollToBottom();
    };
    window.addEventListener(CHAT_SCROLL_TO_BOTTOM_EVENT, handler);
    return () => {
      window.removeEventListener(CHAT_SCROLL_TO_BOTTOM_EVENT, handler);
    };
  }, [scheduleScrollToBottom]);

  const showScrollToLatest = isStreaming && !isViewportNearBottom;

  const handleScrollToLatest = useCallback(() => {
    scheduleScrollToBottom();
  }, [scheduleScrollToBottom]);

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

  // Compact is a timeline event: render after the message where compact happened.
  const renderCompactBoundaryAfter = (messageId: string) => {
    const compactBoundary = compactBoundaryByMessageId.get(messageId);
    if (!compactBoundary) {
      return null;
    }

    return (
      <CompactBoundaryBanner
        descriptionKey={compactBoundary.descriptionKey}
        phase={compactBoundary.phase}
        preview={compactBoundary.preview}
        titleKey={compactBoundary.titleKey}
        titleParams={compactBoundary.titleParams}
      />
    );
  };

  const renderMessage = (message: MessageRecord) => {
    if (message.messageKind === "compact") {
      return null;
    }

    return (
      <div data-message-id={message.id}>
        <MessageItem
          chatRetry={chatRetryByMessageId.get(message.id) ?? null}
          editingMessageId={editingMessageId}
          isStreaming={streamingMessageIds.has(message.id)}
          message={message}
          onEditUserMessage={onEditUserMessage}
          onRegenerateAssistantMessage={onRegenerateAssistantMessage}
          sessionTitle={sessionTitle}
        />
      </div>
    );
  };

  const virtualItems = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];

  return (
    <div
      ref={scrollContainerRef}
      className="relative min-h-0 flex-1 overflow-hidden"
    >
      <ScrollArea
        className={cn(
          "h-full px-3 py-4 md:px-4 md:py-6",
        )}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {systemPrompt ? (
            <SystemPromptBlock
              content={systemPrompt}
              onExpand={onSystemPromptExpand}
            />
          ) : null}
          {shouldVirtualize ? (
            /* ── Virtualized rendering ── */
            messages.length > 0 ? (
              <div
                ref={virtualListRef}
                className="relative w-full"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {virtualItems.map((virtualItem) => {
                  const index = virtualItem.index;
                  const message = timelineMessages[index];
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
                        transform: `translateY(${virtualItem.start - rowVirtualizer.options.scrollMargin}px) translateZ(0)`,
                        width: "100%",
                        willChange: "transform",
                      }}
                    >
                      <div
                        className={cn(
                          "flex flex-col gap-6",
                          index < timelineMessages.length - 1 ? "pb-6" : null
                        )}
                      >
                        {renderBuildBoundarySeparator(index)}
                        {renderMessage(message)}
                        {renderCompactBoundaryAfter(message.id)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null
          ) : (
            /* ── Simple (non-virtualized) rendering ── */
            timelineMessages.map((message, index) => (
              <Fragment key={message.id}>
                {renderBuildBoundarySeparator(index)}
                {renderMessage(message)}
                {renderCompactBoundaryAfter(message.id)}
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
