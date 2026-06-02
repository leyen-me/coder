import type { ToolUIPart } from "ai";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { normalizeToolInvocations, type MessageToolInvocation } from "@/lib/db";
import type { MessageRecord } from "@/lib/db";

type MessageToolListProps = {
  message: MessageRecord;
};

export function MessageToolList({ message }: MessageToolListProps) {
  const invocations = normalizeToolInvocations(message.toolInvocations);

  if (invocations.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-2">
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
  return (
    <Tool className={className} defaultOpen={false}>
      <ToolHeader
        type="dynamic-tool"
        toolName={invocation.name}
        state={invocation.state as ToolUIPart["state"]}
      />
      <ToolContent>
        <ToolInput input={invocation.input} />
        <ToolOutput
          output={invocation.output}
          errorText={invocation.errorText}
        />
      </ToolContent>
    </Tool>
  );
}
