import { normalizeToolInvocations, type MessageToolInvocation } from "@/lib/db";
import type { MessageRecord } from "@/lib/db";

import { ToolInvocationChip } from "./tool-invocation-chip";

type MessageToolListProps = {
  message: MessageRecord;
};

export function MessageToolList({ message }: MessageToolListProps) {
  const invocations = normalizeToolInvocations(message.toolInvocations);

  if (invocations.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {invocations.map((invocation) => (
        <MessageToolItem key={invocation.id} invocation={invocation} />
      ))}
    </div>
  );
}

type MessageToolItemProps = {
  invocation: MessageToolInvocation;
  className?: string;
};

export function MessageToolItem({ invocation, className }: MessageToolItemProps) {
  return <ToolInvocationChip className={className} invocation={invocation} />;
}
