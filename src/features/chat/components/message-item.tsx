import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { MessageRecord } from "@/lib/db";
import { cn } from "@/lib/utils";

import { ThinkingBlock } from "./thinking-block";

type MessageItemProps = {
  message: MessageRecord;
};

export function MessageItem({ message }: MessageItemProps) {
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

  if (isUser) {
    return (
      <Message from="user">
        <MessageContent>{message.content}</MessageContent>
      </Message>
    );
  }

  return (
    <Message from="assistant">
      {(hasThinking || (message.thinking && isStreaming && !message.content)) && (
        <ThinkingBlock
          content={message.thinking}
          isStreaming={isStreaming && !message.content}
        />
      )}
      {answerText ? (
        <MessageContent className="group-[.is-assistant]:bg-transparent group-[.is-assistant]:p-0">
          <MessageResponse isAnimating={isStreaming}>
            {answerText}
          </MessageResponse>
        </MessageContent>
      ) : null}
      {message.status === "failed" && message.error ? (
        <p className="text-sm text-destructive">{message.error}</p>
      ) : null}
      {isStreaming && !answerText ? (
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
