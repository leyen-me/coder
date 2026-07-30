import {
  Attachment,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
import { paths } from "@/app/paths";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { forkSessionFromMessage } from "@/lib/db";
import {
  normalizeMessageProcessSteps,
  normalizeToolInvocations,
  type MessageRecord,
} from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { hoverRevealClassName } from "@/lib/responsive-hover";
import { toast } from "sonner";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDownIcon, CopyIcon, GitForkIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ChatRetryState } from "@/features/agent/types";

import {
  buildAssistantProcessSteps,
  getAssistantTimelineSteps,
  shouldShowAssistantProcessTimeline,
  type AssistantProcessStep,
} from "./assistant-process";
import { AssistantProcessCollapsible } from "./assistant-process-collapsible";
import { ProxyContinuationBlock } from "./assistant-process-view";
import { StreamingMessageContent } from "./streaming-message-content";
import { UserMessageContent } from "./user-message-content";

type MessageItemProps = {
  message: MessageRecord;
  sessionTitle?: string;
  isStreaming: boolean;
  chatRetry?: ChatRetryState | null;
  editingMessageId?: string | null;
  onEditUserMessage?: (message: MessageRecord) => void;
  onRegenerateAssistantMessage?: (message: MessageRecord) => void;
};

function areMessageItemPropsEqual(
  prev: MessageItemProps,
  next: MessageItemProps
): boolean {
  if (prev.sessionTitle !== next.sessionTitle) {
    return false;
  }

  if (prev.isStreaming !== next.isStreaming) {
    return false;
  }

  if (prev.chatRetry?.attempt !== next.chatRetry?.attempt) {
    return false;
  }

  if (prev.chatRetry?.maxAttempts !== next.chatRetry?.maxAttempts) {
    return false;
  }

  if (prev.editingMessageId !== next.editingMessageId) {
    return false;
  }

  if (prev.onEditUserMessage !== next.onEditUserMessage) {
    return false;
  }

  if (prev.onRegenerateAssistantMessage !== next.onRegenerateAssistantMessage) {
    return false;
  }

  const prevMessage = prev.message;
  const nextMessage = next.message;

  return (
    prevMessage.id === nextMessage.id &&
    prevMessage.role === nextMessage.role &&
    prevMessage.status === nextMessage.status &&
    prevMessage.content === nextMessage.content &&
    prevMessage.thinking === nextMessage.thinking &&
    prevMessage.error === nextMessage.error &&
    prevMessage.processSteps === nextMessage.processSteps &&
    prevMessage.toolInvocations === nextMessage.toolInvocations &&
    prevMessage.images === nextMessage.images &&
    prevMessage.messageKind === nextMessage.messageKind &&
    prevMessage.taskId === nextMessage.taskId &&
    areReferencedSkillsEqual(
      prevMessage.referencedSkills,
      nextMessage.referencedSkills
    )
  );
}

function areReferencedSkillsEqual(
  prev: readonly string[] | undefined,
  next: readonly string[] | undefined
): boolean {
  if (prev === next) {
    return true;
  }
  if (!prev || !next || prev.length !== next.length) {
    return false;
  }
  return prev.every((slug, index) => slug === next[index]);
}

/**
 * Ordered fragments derived from a message's process steps. Each `segment` is a
 * run of consecutive non-decision steps (rendered as its own collapsible or
 * standalone answer); each `decision` is a proxy/agent checkpoint rendered as a
 * standalone user-style block. Keeping the decision markers between segments
 * preserves the original timeline order instead of grouping all answers before
 * all proxies.
 */
type RenderItem =
  | { kind: "segment"; id: string; steps: AssistantProcessStep[] }
  | {
      kind: "decision";
      id: string;
      step: Extract<AssistantProcessStep, { kind: "decision" }>;
    };

function lastAnswerTextOf(steps: AssistantProcessStep[]): string {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.kind === "answer") {
      return step.text;
    }
  }
  return "";
}

export const MessageItem = memo(function MessageItem({
  message,
  sessionTitle,
  isStreaming,
  chatRetry = null,
  editingMessageId,
  onEditUserMessage,
  onRegenerateAssistantMessage,
}: MessageItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isForking, setIsForking] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const isActionPending = isForking || isRegenerating;
  const isUser = message.role === "user";
  const toolInvocations = useMemo(
    () => normalizeToolInvocations(message.toolInvocations),
    [message.toolInvocations]
  );
  const persistedSteps = useMemo(
    () => normalizeMessageProcessSteps(message.processSteps),
    [message.processSteps]
  );
  const answerText = useMemo(() => {
    for (let index = persistedSteps.length - 1; index >= 0; index -= 1) {
      const step = persistedSteps[index];
      if (step?.kind === "answer") {
        return step.text;
      }
    }

    return (
      message.content ||
      (!isStreaming && message.thinking ? message.thinking : "")
    );
  }, [persistedSteps, message.content, message.thinking, isStreaming]);
  const hasReasoningSteps = persistedSteps.some((step) => step.kind === "reasoning");
  const hasThinkingText = Boolean(message.thinking.trim());
  const hasSeparateThinking =
    hasThinkingText &&
    Boolean(message.content) &&
    message.thinking !== answerText;
  const isThinkingStreaming = isStreaming && !message.content;
  const showReasoning =
    hasReasoningSteps ||
    hasSeparateThinking ||
    (hasThinkingText && isThinkingStreaming);
  const hasTools = toolInvocations.length > 0;
  const processSteps = useMemo(
    () =>
      buildAssistantProcessSteps({
        processSteps: message.processSteps,
        answerText,
        thinkingText: message.thinking,
        isThinkingStreaming,
        showReasoning,
        toolInvocations,
        isAnswerStreaming: isStreaming,
        isMessageStreaming: isStreaming,
      }),
    [
      message.processSteps,
      answerText,
      message.thinking,
      isThinkingStreaming,
      showReasoning,
      toolInvocations,
      isStreaming,
    ]
  );
  const isPlanMessage = message.messageKind === "plan";
  const timelineSteps = useMemo(
    () => getAssistantTimelineSteps({ steps: processSteps, isPlanMessage }),
    [isPlanMessage, processSteps]
  );
  // Split the ordered timeline into interleaved fragments: a run of
  // consecutive non-decision steps becomes one `segment` (its own collapsible
  // or standalone answer), and each decision step becomes a `decision`
  // fragment rendered as a standalone user-style block right where it sits in
  // the timeline. This preserves the original order — answer 1 -> proxy 1 ->
  // answer 2 -> proxy 2 — instead of grouping all answers before all proxies.
  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];
    let current: AssistantProcessStep[] = [];
    let segmentIndex = 0;
    const flush = () => {
      if (current.length > 0) {
        items.push({
          kind: "segment",
          id: `seg-${segmentIndex++}`,
          steps: current,
        });
        current = [];
      }
    };
    for (const step of timelineSteps) {
      if (step.kind !== "decision") {
        current.push(step);
        continue;
      }
      const isRenderableDecision =
        step.status === "requested" ||
        (step.status === "resolved" && step.response != null);
      if (!isRenderableDecision) {
        continue;
      }
      flush();
      items.push({ kind: "decision", id: step.id, step });
    }
    flush();
    return items;
  }, [timelineSteps]);

  const lastSegmentIndex = useMemo(() => {
    for (let index = renderItems.length - 1; index >= 0; index -= 1) {
      if (renderItems[index].kind === "segment") {
        return index;
      }
    }
    return -1;
  }, [renderItems]);
  const showActions =
    !isStreaming &&
    (Boolean(answerText) ||
      message.status === "failed" ||
      message.status === "cancelled");

  const handleCopy = useCallback(async () => {
    if (!answerText) {
      return;
    }
    try {
      await copyTextToClipboard(answerText);
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message);
      }
    }
  }, [answerText]);

  const handleUserCopy = useCallback(async () => {
    const images = message.images ?? [];
    const parts: string[] = [];
    if (message.content.trim()) {
      parts.push(message.content);
    }
    for (const image of images) {
      parts.push(image.filename?.trim() || image.url);
    }
    if (parts.length === 0) {
      return;
    }
    try {
      await copyTextToClipboard(parts.join("\n"));
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message);
      }
    }
  }, [message.content, message.images]);

  const handleUserEdit = useCallback(() => {
    onEditUserMessage?.(message);
  }, [message, onEditUserMessage]);

  const handleFork = useCallback(async () => {
    if (isForking) {
      return;
    }

    setIsForking(true);
    try {
      const title = t("chat.forkSessionTitle", {
        title: sessionTitle?.trim() || t("session.newChat"),
      });
      const forkedSession = await forkSessionFromMessage(
        message.sessionId,
        message.id,
        title
      );
      navigate(paths.chat(forkedSession.id));
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message);
      }
    } finally {
      setIsForking(false);
    }
  }, [isForking, message.id, message.sessionId, navigate, sessionTitle, t]);

  const handleRegenerate = useCallback(async () => {
    if (isRegenerating || !onRegenerateAssistantMessage) {
      return;
    }

    setIsRegenerating(true);
    try {
      await onRegenerateAssistantMessage(message);
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message);
      }
    } finally {
      setIsRegenerating(false);
    }
  }, [isRegenerating, message, onRegenerateAssistantMessage]);

  if (message.messageKind === "compact") {
    return null;
  }

  if (isUser) {
    const images = message.images ?? [];
    const hasCopyContent =
      Boolean(message.content.trim()) || images.length > 0;
    const isEditing = editingMessageId === message.id;
    const [contentExpanded, setContentExpanded] = useState(false);
    const contentRef = useRef<HTMLSpanElement>(null);
    const [isLongContent, setIsLongContent] = useState(false);

    // Check if content exceeds ~6 lines after mount.
    useEffect(() => {
      const el = contentRef.current;
      if (el) {
        // line-height ~1.5 * 16px (text-sm) ≈ 24px, 6 lines ≈ 144px
        setIsLongContent(el.scrollHeight > 144);
      }
    }, [message.content]);

    return (
      <Message from="user">
        <MessageContent
          className={cn(
            "gap-2",
            isEditing && "ring-2 ring-ring/60 ring-offset-2 ring-offset-background"
          )}
        >
          {images.length > 0 ? (
            <Attachments className="w-fit" variant="grid">
              {images.map((image) => (
                <Attachment
                  data={{
                    id: image.id,
                    type: "file",
                    url: image.url,
                    ...(image.filename ? { filename: image.filename } : {}),
                    mediaType: image.mediaType ?? "application/octet-stream",
                  }}
                  key={image.id}
                >
                  <AttachmentPreview />
                </Attachment>
              ))}
            </Attachments>
          ) : null}
          {message.content.trim() ? (
            <Collapsible open={contentExpanded} onOpenChange={setContentExpanded}>
              <div>
                <span
                  ref={contentRef}
                  className={cn(
                    "block whitespace-pre-wrap break-words",
                    !contentExpanded && "line-clamp-6",
                  )}
                >
                  <UserMessageContent
                    text={message.content}
                    referencedSkills={message.referencedSkills}
                  />
                </span>
                {isLongContent ? (
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      <ChevronDownIcon
                        className={cn(
                          "size-3 transition-transform duration-200",
                          contentExpanded && "rotate-180",
                        )}
                      />
                      {contentExpanded ? t("chat.showLess") : t("chat.showMore")}
                    </button>
                  </CollapsibleTrigger>
                ) : null}
              </div>
            </Collapsible>
          ) : null}
        </MessageContent>
        {hasCopyContent ? (
          <MessageActions
            className={cn(
              "mt-1 self-end transition-opacity",
              isEditing
                ? "opacity-100"
                : hoverRevealClassName
            )}
          >
            <MessageAction
              label={t("chat.copyMessage")}
              onClick={() => {
                void handleUserCopy();
              }}
              tooltip={t("chat.copyMessage")}
            >
              <CopyIcon className="size-3.5" />
            </MessageAction>
            {onEditUserMessage ? (
              <MessageAction
                label={t("chat.editMessage")}
                onClick={handleUserEdit}
                tooltip={t("chat.editMessage")}
              >
                <PencilIcon className="size-3.5" />
              </MessageAction>
            ) : null}
          </MessageActions>
        ) : null}
      </Message>
    );
  }

  const trailingBlock = (
    <>
      {showActions ? (
        <MessageActions className={cn("mt-1 transition-opacity", hoverRevealClassName)}>
          <MessageAction
            disabled={isActionPending}
            label={t("chat.copyMessage")}
            onClick={() => {
              void handleCopy();
            }}
            tooltip={t("chat.copyMessage")}
          >
            <CopyIcon className="size-3.5" />
          </MessageAction>
          {onRegenerateAssistantMessage ? (
            <MessageAction
              disabled={isActionPending}
              label={t("chat.regenerateMessage")}
              onClick={() => {
                void handleRegenerate();
              }}
              tooltip={t("chat.regenerateMessage")}
            >
              <RefreshCwIcon
                className={cn("size-3.5", isRegenerating && "animate-spin")}
              />
            </MessageAction>
          ) : null}
          <MessageAction
            disabled={isActionPending}
            label={t("chat.forkMessage")}
            onClick={() => {
              void handleFork();
            }}
            tooltip={t("chat.forkMessage")}
          >
            <GitForkIcon className="size-3.5" />
          </MessageAction>
        </MessageActions>
      ) : null}
      {message.status === "failed" && message.error ? (
        <p className="text-sm text-destructive">{message.error}</p>
      ) : null}
      {isStreaming && chatRetry && !answerText ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={cn(
              "size-1.5 animate-pulse rounded-full bg-muted-foreground"
            )}
          />
          <span>
            {t("chat.chatRetrying", {
              attempt: chatRetry.attempt,
              maxAttempts: chatRetry.maxAttempts,
            })}
          </span>
        </div>
      ) : isStreaming && !answerText && !showReasoning && !hasTools ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={cn(
              "size-1.5 animate-pulse rounded-full bg-muted-foreground"
            )}
          />
          <span className="animate-pulse">...</span>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="flex w-full flex-col gap-3">
      {renderItems.map((item, index) => {
        if (item.kind === "decision") {
          return <ProxyContinuationBlock key={item.id} step={item.step} />;
        }

        const segmentShowsCollapsible = shouldShowAssistantProcessTimeline({
          steps: item.steps,
          isPlanMessage,
        });
        const segmentAnswerText = lastAnswerTextOf(item.steps);
        const isLastSegment = index === lastSegmentIndex;
        // Only the live (last) fragment should be in the streaming state. As
        // steps stream in, the "last fragment" advances, so each completed turn
        // loses streaming and auto-closes on its own — exactly like separate
        // sequential chat turns rather than one panel closing everything at
        // once. This makes each answer+proxy read as an independent message.
        const isActiveFragment = index === renderItems.length - 1;

        return (
          <Message from="assistant" key={item.id}>
            {segmentShowsCollapsible ? (
              <AssistantProcessCollapsible
                steps={item.steps}
                taskId={message.taskId}
                isStreaming={isStreaming && isActiveFragment}
                answerText={segmentAnswerText}
                durationMs={message.durationMs}
                defaultOpen={isPlanMessage}
              />
            ) : segmentAnswerText ? (
              <StreamingMessageContent text={segmentAnswerText} />
            ) : null}
            {isLastSegment ? trailingBlock : null}
          </Message>
        );
      })}
      {lastSegmentIndex === -1 ? (
        <Message from="assistant">{trailingBlock}</Message>
      ) : null}
    </div>
  );
}, areMessageItemPropsEqual);
