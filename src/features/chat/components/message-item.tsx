import {
  Attachment,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import { buildAssistantProcessSteps } from "./assistant-process";
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
import { CopyIcon, GitForkIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { StreamingMessageContent } from "./streaming-message-content";

type MessageItemProps = {
  message: MessageRecord;
  sessionTitle?: string;
  isStreaming: boolean;
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
}: MessageItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isForking, setIsForking] = useState(false);
  const isUser = message.role === "user";
  const persistedSteps = normalizeMessageProcessSteps(message.processSteps);
  let latestAnswerText = "";
  for (let index = persistedSteps.length - 1; index >= 0; index -= 1) {
    const step = persistedSteps[index];
    if (step?.kind === "answer") {
      latestAnswerText = step.text;
      break;
    }
  }
  const answerText =
    latestAnswerText ||
    message.content ||
    (!isStreaming && message.thinking ? message.thinking : "");
  const hasThinking =
    Boolean(message.thinking) &&
    Boolean(message.content) &&
    message.thinking !== answerText;
  const isThinkingStreaming = isStreaming && !message.content;
  const showReasoning =
    hasThinking || (Boolean(message.thinking) && isThinkingStreaming);
  const toolInvocations = normalizeToolInvocations(message.toolInvocations);
  const hasTools = toolInvocations.length > 0;
  const processSteps = buildAssistantProcessSteps({
    processSteps: message.processSteps,
    answerText,
    thinkingText: message.thinking,
    isThinkingStreaming,
    showReasoning,
    toolInvocations,
    isAnswerStreaming: isStreaming,
    isMessageStreaming: isStreaming,
  });
  const showProcessTimeline = showReasoning || hasTools;
  const showActions = Boolean(answerText) && !isStreaming;

  const handleCopy = useCallback(async () => {
    if (!answerText) {
      return;
    }
    await navigator.clipboard.writeText(answerText);
  }, [answerText]);

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

  if (isUser) {
    const images = message.images ?? [];
    return (
      <Message from="user">
        <MessageContent className="gap-2">
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
            disabled={isForking}
            label={t("chat.copyMessage")}
            onClick={() => {
              void handleCopy();
            }}
            tooltip={t("chat.copyMessage")}
          >
            <CopyIcon className="size-3.5" />
          </MessageAction>
          <MessageAction
            disabled={isForking}
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
