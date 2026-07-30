"use client";

import type { MessageToolInvocation } from "@/lib/db";
import type { DecisionResponse } from "@/lib/decision";
import { ASK_QUESTION_TOOL_NAME } from "@/features/agent/tools/definitions";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Message,
  MessageContent,
} from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";

import type { AssistantProcessStep } from "./assistant-process";
import { CompactProcessChip } from "./compact-process-chip";
import { MessageToolItem } from "./message-tool-list";
import { Spinner } from "@/components/ui/spinner";
import { StreamingMessageContent } from "./streaming-message-content";
import { ThinkingBlock } from "./thinking-block";
import { useTranslation } from "@/lib/i18n/locale-provider";

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

        if (group.kind === "compact") {
          return (
            <CompactProcessChip
              key={group.id}
              preview={group.preview}
              removedCount={group.removedCount}
              state={group.state}
            />
          );
        }

        if (group.kind === "answer") {
          return (
            <StreamingMessageContent
              key={group.id}
              text={group.text}
              className="!text-muted-foreground"
            />
          );
        }

        // `decision` steps are no longer rendered inside the assistant
        // process timeline. They are lifted to the top level by the message
        // item so they read as standalone user-style blocks (see
        // ProxyContinuationBlock). Keeping this branch out avoids nesting the
        // proxy block inside the collapsible's indented, open-gated interior.
        return null;
      })}
    </div>
  );
}

export type ProxyContinuationBlockProps = {
  step: Extract<AssistantProcessStep, { kind: "decision" }>;
};

/**
 * Renders a proxy/agent decision as a standalone user-style bubble. It is
 * intentionally rendered at the message-item level (outside the assistant
 * process collapsible) so it appears like a peer of a real user message:
 * right-aligned, full-width, and always visible regardless of the
 * collapsible's open state. The only visual distinction from a real user
 * message is the subtle `bg-primary/10` background tint.
 */
export function ProxyContinuationBlock({ step }: ProxyContinuationBlockProps) {
  const { t } = useTranslation();

  if (step.status === "requested") {
    return (
      <Message from="user">
        <MessageContent className="gap-2 !bg-primary/10">
          <div className="flex items-center gap-2 text-sm">
            <Spinner className="size-4" />
            <span className="text-muted-foreground">
              {t("chat.proxyContinuationLoading")}
            </span>
          </div>
        </MessageContent>
      </Message>
    );
  }

  // The proxy continuation reuses the exact same user bubble so it reads as a
  // peer of a real user message. The only visual distinction is a subtle
  // background tint (bg-primary/10); the decision details stay available on
  // hover.
  if (
    step.status === "resolved" &&
    step.response != null &&
    step.response.outcome === "continue" &&
    step.response.suggestedContinuation?.trim()
  ) {
    return (
      <Message from="user">
        <MessageContent className="gap-2 !bg-primary/10">
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="cursor-help whitespace-pre-wrap wrap-break-word">
                {step.response.suggestedContinuation.trim()}
              </span>
            </HoverCardTrigger>
            <HoverCardContent
              align="start"
              className="w-80 space-y-3"
              side="top"
            >
              <ProxyContinuationDetails response={step.response} />
            </HoverCardContent>
          </HoverCard>
        </MessageContent>
      </Message>
    );
  }

  // Show resolved decision outcome (complete / ask_user / stop_path)
  if (step.status === "resolved" && step.response) {
    return (
      <Message from="user">
        <MessageContent className="gap-2 !bg-primary/10">
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="cursor-help whitespace-pre-wrap wrap-break-word">
                {step.response.outcome === "complete"
                  ? t("chat.decisionOutcomeComplete")
                  : step.response.outcome === "ask_user"
                    ? t("chat.decisionOutcomeAskUser")
                    : step.response.outcome === "stop_path"
                      ? t("chat.decisionOutcomeStopPath")
                      : ""}
              </span>
            </HoverCardTrigger>
            <HoverCardContent
              align="start"
              className="w-80 space-y-3"
              side="top"
            >
              <ProxyContinuationDetails response={step.response} />
            </HoverCardContent>
          </HoverCard>
        </MessageContent>
      </Message>
    );
  }

  return null;
}

function ProxyContinuationDetails({ response }: { response: DecisionResponse }) {
  const { t } = useTranslation();

  return (
    <>
      <p className="font-medium text-sm">
        {t("chat.proxyContinuationHoverTitle")}
      </p>
      <div className="space-y-2 text-sm text-muted-foreground">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {response.outcome === "continue"
              ? t("chat.decisionOutcomeContinue")
              : response.outcome === "complete"
                ? t("chat.decisionOutcomeComplete")
                : response.outcome === "ask_user"
                  ? t("chat.decisionOutcomeAskUser")
                  : t("chat.decisionOutcomeStopPath")}
          </Badge>
          <Badge
            variant={
              response.riskLevel === "high" ? "destructive" : "outline"
            }
            className="text-xs"
          >
            {response.riskLevel === "high"
              ? t("chat.decisionRiskHigh")
              : response.riskLevel === "medium"
                ? t("chat.decisionRiskMedium")
                : t("chat.decisionRiskLow")}
          </Badge>
        </div>
        {response.reason ? (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground text-xs">
              {t("chat.decisionReason")}
            </p>
            <p className="whitespace-pre-wrap text-xs">{response.reason}</p>
          </div>
        ) : null}
        {response.assumption ? (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground text-xs">
              {t("chat.decisionAssumption")}
            </p>
            <p className="whitespace-pre-wrap text-xs">
              {response.assumption}
            </p>
          </div>
        ) : null}
      </div>
    </>
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
