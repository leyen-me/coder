import {
  Attachment,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import { AssistantProcessView } from "./assistant-process-view";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
import { paths } from "@/app/paths";
import { forkSessionFromMessage } from "@/lib/db";
import {
  normalizeMessageProcessSteps,
  normalizeToolInvocations,
  type MessageRecord,
} from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { CopyIcon, GitForkIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  buildAssistantProcessSteps,
} from "./assistant-process";
import { StreamingMessageContent } from "./streaming-message-content";

type MessageItemProps = {
  message: MessageRecord;
  sessionTitle?: string;
  isStreaming: boolean;
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
    prevMessage.images === nextMessage.images
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  sessionTitle,
  isStreaming,
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
  const showProcessTimeline = showReasoning || hasTools;
  const showActions =
    !isStreaming &&
    (Boolean(answerText) ||
      message.status === "failed" ||
      message.status === "cancelled");

  const handleCopy = useCallback(async () => {
    if (!answerText) {
      return;
    }
    await navigator.clipboard.writeText(answerText);
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
    await navigator.clipboard.writeText(parts.join("\n"));
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
    } finally {
      setIsRegenerating(false);
    }
  }, [isRegenerating, message, onRegenerateAssistantMessage]);

  if (isUser) {
    const images = message.images ?? [];
    const hasCopyContent =
      Boolean(message.content.trim()) || images.length > 0;
    const isEditing = editingMessageId === message.id;

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
          {message.content ? <span>{message.content}</span> : null}
        </MessageContent>
        {hasCopyContent ? (
          <MessageActions
            className={cn(
              "mt-1 self-end transition-opacity",
              isEditing
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
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

  return (
    <Message from="assistant">
      {showProcessTimeline ? (
        <AssistantProcessView steps={processSteps} />
      ) : answerText ? (
        <StreamingMessageContent isStreaming={isStreaming} text={answerText} />
      ) : null}
      {showActions ? (
        <MessageActions className="mt-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
      {isStreaming && !answerText && !showReasoning && !hasTools ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={cn(
              "size-1.5 animate-pulse rounded-full bg-muted-foreground"
            )}
          />
          <span className="animate-pulse">...</span>
        </div>
      ) : null}
    </Message>
  );
}, areMessageItemPropsEqual);
