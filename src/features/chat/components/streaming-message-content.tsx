import { MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { memo } from "react";

type StreamingMessageContentProps = {
  text: string;
  isStreaming: boolean;
  className?: string;
};

export const StreamingMessageContent = memo(function StreamingMessageContent({
  text,
  isStreaming,
  className,
}: StreamingMessageContentProps) {
  if (isStreaming) {
    return (
      <MessageContent
        className={cn(
          "group-[.is-assistant]:overflow-visible group-[.is-assistant]:bg-transparent group-[.is-assistant]:p-0",
          className
        )}
      >
        <div className="whitespace-pre-wrap wrap-break-word text-sm">{text}</div>
      </MessageContent>
    );
  }

  return (
    <MessageContent
      className={cn(
        "group-[.is-assistant]:overflow-visible group-[.is-assistant]:bg-transparent group-[.is-assistant]:p-0",
        className
      )}
    >
      <MessageResponse>{text}</MessageResponse>
    </MessageContent>
  );
});

type StreamingPlainTextProps = {
  text: string;
  isStreaming: boolean;
  className?: string;
};

export const StreamingPlainText = memo(function StreamingPlainText({
  text,
  isStreaming,
  className,
}: StreamingPlainTextProps) {
  if (isStreaming) {
    return (
      <div className={cn("whitespace-pre-wrap wrap-break-word", className)}>
        {text}
      </div>
    );
  }

  return (
    <MessageResponse className={className}>{text}</MessageResponse>
  );
});
