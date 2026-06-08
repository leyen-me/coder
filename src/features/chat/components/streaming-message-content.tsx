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
  return (
    <MessageContent
      className={cn(
        "group-[.is-assistant]:overflow-visible group-[.is-assistant]:bg-transparent group-[.is-assistant]:p-0",
        className
      )}
    >
      <MessageResponse isAnimating={isStreaming}>{text}</MessageResponse>
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
  return (
    <MessageResponse className={className} isAnimating={isStreaming}>
      {text}
    </MessageResponse>
  );
});
