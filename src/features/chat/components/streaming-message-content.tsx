import { MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { memo } from "react";

type StreamingMessageContentProps = {
  text: string;
  className?: string;
};

export const StreamingMessageContent = memo(function StreamingMessageContent({
  text,
  className,
}: StreamingMessageContentProps) {
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
  className?: string;
};

export const StreamingPlainText = memo(function StreamingPlainText({
  text,
  className,
}: StreamingPlainTextProps) {
  return (
    <MessageResponse className={className}>
      {text}
    </MessageResponse>
  );
});
