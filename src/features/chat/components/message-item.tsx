import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { MessageRecord } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

type MessageItemProps = {
  message: MessageRecord;
};

export function MessageItem({ message }: MessageItemProps) {
  const { t } = useTranslation();
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
