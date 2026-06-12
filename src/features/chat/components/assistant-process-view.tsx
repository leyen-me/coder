"use client";

import type { MessageToolInvocation } from "@/lib/db";
import { ASK_QUESTION_TOOL_NAME } from "@/features/agent/tools/definitions";

import type { AssistantProcessStep } from "./assistant-process";
import { MessageToolItem } from "./message-tool-list";
import { StreamingMessageContent } from "./streaming-message-content";
import { ThinkingBlock } from "./thinking-block";

type AssistantProcessViewProps = {
  steps: AssistantProcessStep[];
  taskId?: string | null;
};

type AssistantProcessGroup =
  | AssistantProcessStep
  | {
      id: string;
      kind: "tools";
      invocations: MessageToolInvocation[];
    };

export function AssistantProcessView({ steps, taskId }: AssistantProcessViewProps) {
  const groups = groupAssistantProcessSteps(steps);

  return (
    <div className="flex w-full flex-col gap-3">
      {groups.map((group) => {
        if (group.kind === "tools") {
          const askQuestionInvocations = group.invocations.filter(
            (invocation) => invocation.name === ASK_QUESTION_TOOL_NAME
          );
          const standardInvocations = group.invocations.filter(
            (invocation) => invocation.name !== ASK_QUESTION_TOOL_NAME
          );

          return (
            <div className="flex flex-col gap-3" key={group.id}>
              {standardInvocations.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {standardInvocations.map((invocation) => (
                    <MessageToolItem
                      invocation={invocation}
                      key={invocation.id}
                      taskId={taskId}
                    />
                  ))}
                </div>
              ) : null}
              {askQuestionInvocations.map((invocation) => (
                <MessageToolItem
                  invocation={invocation}
                  key={invocation.id}
                  taskId={taskId}
                />
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
