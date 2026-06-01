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
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-3xl flex-col gap-2">
        {(hasThinking || (message.thinking && isStreaming && !message.content)) && (
          <ThinkingBlock
            content={message.thinking}
            isStreaming={isStreaming && !message.content}
          />
        )}
        {answerText ? (
          <div className="text-sm leading-relaxed">
            <p className="whitespace-pre-wrap break-words">{answerText}</p>
          </div>
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
      </div>
    </div>
  );
}
