import { normalizeToolInvocations, type MessageToolInvocation } from "@/lib/db";
import type { MessageRecord } from "@/lib/db";

import { ASK_QUESTION_TOOL_NAME } from "@/features/agent/tools/definitions";

import { AskQuestionToolCard } from "./ask-question-tool-card";
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
    <div className="flex flex-col gap-1">
      {invocations.map((invocation) => (
        <MessageToolItem
          invocation={invocation}
          key={invocation.id}
          taskId={message.taskId}
        />
      ))}
    </div>
  );
}

type MessageToolItemProps = {
  invocation: MessageToolInvocation;
  taskId?: string | null;
  className?: string;
};

export function MessageToolItem({
  invocation,
  taskId,
  className,
}: MessageToolItemProps) {
  if (
    invocation.name === ASK_QUESTION_TOOL_NAME &&
    invocation.state === "input-available" &&
    taskId
  ) {
    return <AskQuestionToolCard invocation={invocation} taskId={taskId} />;
  }

  return <ToolInvocationChip className={className} invocation={invocation} />;
}
