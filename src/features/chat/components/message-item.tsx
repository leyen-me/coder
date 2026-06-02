import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { paths } from "@/app/paths";
import { forkSessionFromMessage } from "@/lib/db";
import type { MessageRecord } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { CopyIcon, GitForkIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

type MessageItemProps = {
  message: MessageRecord;
  sessionTitle?: string;
};

export function MessageItem({ message, sessionTitle }: MessageItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isForking, setIsForking] = useState(false);
  const isUser = message.role === "user";
  const isStreaming =
    message.status === "pending" || message.status === "streaming";
  const answerText =
    message.content ||
    (!isStreaming && message.thinking ? message.thinking : "");
  const hasThinking =
    Boolean(message.thinking) &&
    Boolean(message.content) &&
    message.thinking !== answerText;
  const isThinkingStreaming = isStreaming && !message.content;
  const showReasoning =
    hasThinking || (Boolean(message.thinking) && isThinkingStreaming);
  const showActions = Boolean(answerText) && !isStreaming;

  const getThinkingMessage = useCallback(
    (streaming: boolean, duration?: number) => {
      if (streaming || duration === 0) {
        return <Shimmer duration={1}>{t("chat.thinkingInProgress")}</Shimmer>;
      }
      if (duration === undefined) {
        return <p>{t("chat.thinking")}</p>;
      }
      return <p>{t("chat.thoughtForSeconds", { duration })}</p>;
    },
    [t]
  );

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
    return (
      <Message from="user">
        <MessageContent>{message.content}</MessageContent>
      </Message>
    );
  }

  return (
    <Message from="assistant">
      {showReasoning ? (
        <Reasoning className="w-full" isStreaming={isThinkingStreaming}>
          <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
          <ReasoningContent>
            {message.thinking || t("chat.thinkingPlaceholder")}
          </ReasoningContent>
        </Reasoning>
      ) : null}
      {answerText ? (
        <MessageContent className="group-[.is-assistant]:overflow-visible group-[.is-assistant]:bg-transparent group-[.is-assistant]:p-0">
          <MessageResponse isAnimating={isStreaming}>
            {answerText}
          </MessageResponse>
        </MessageContent>
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
      {isStreaming && !answerText && !showReasoning ? (
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
}
