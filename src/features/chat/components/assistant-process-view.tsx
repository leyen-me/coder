"use client";

import type { MessageToolInvocation } from "@/lib/db";

import type { AssistantProcessStep } from "./assistant-process";
import { MessageToolItem } from "./message-tool-list";
import { StreamingMessageContent } from "./streaming-message-content";
import { ThinkingBlock } from "./thinking-block";

type AssistantProcessViewProps = {
  steps: AssistantProcessStep[];
};

type AssistantProcessGroup =
  | AssistantProcessStep
  | {
      id: string;
      kind: "tools";
      invocations: MessageToolInvocation[];
    };

export function AssistantProcessView({ steps }: AssistantProcessViewProps) {
  const groups = groupAssistantProcessSteps(steps);

  return (
    <div className="flex w-full flex-col gap-3">
      {groups.map((group) => {
        if (group.kind === "tools") {
          return (
            <div className="flex flex-wrap gap-2" key={group.id}>
              {group.invocations.map((invocation) => (
                <MessageToolItem invocation={invocation} key={invocation.id} />
              ))}
            </div>
          );
        }

        if (group.kind === "reasoning") {
          return (
            <ThinkingBlock
              key={group.id}
              isStreaming={group.isStreaming}
              segments={[{ kind: "text", text: group.text }]}
            />
          );
        }

        if (group.kind === "answer") {
          return (
            <StreamingMessageContent
              isStreaming={group.isStreaming}
              key={group.id}
              text={group.text}
            />
          );
        }

        return null;
      })}
    </div>
  );
}

function groupAssistantProcessSteps(
  steps: AssistantProcessStep[]
): AssistantProcessGroup[] {
  const groups: AssistantProcessGroup[] = [];

  for (const step of steps) {
    if (step.kind !== "tool") {
      groups.push(step);
      continue;
    }

    const lastGroup = groups.at(-1);
    if (lastGroup?.kind === "tools") {
      lastGroup.invocations.push(step.invocation);
      continue;
    }

    groups.push({
      id: step.id,
      kind: "tools",
      invocations: [step.invocation],
    });
  }

  return groups;
}
