"use client";

import type { MessageToolInvocation } from "@/lib/db";
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
import { BotIcon } from "lucide-react";

import type { AssistantProcessStep } from "./assistant-process";
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
  const { t } = useTranslation();
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
              key={group.id}
              text={group.text}
              className="!text-muted-foreground"
            />
          );
        }

        if (group.kind === "decision") {
          if (group.status === "requested") {
            return (
              <Message key={group.id} from="user">
                <MessageContent className="gap-2">
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

          // Show the proxy continuation as a user-message-like block
          if (
            group.status === "resolved" &&
            group.response?.outcome === "continue" &&
            group.response?.suggestedContinuation?.trim()
          ) {
            return (
              <Message key={group.id} from="user">
                <MessageContent className="gap-2">
                  <HoverCard openDelay={200} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <Badge
                        variant="outline"
                        className="cursor-help gap-1 border-primary/30 text-xs text-primary/70 hover:text-primary"
                      >
                        <BotIcon className="size-3" />
                        {t("chat.proxyContinuationBadge")}
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent
                      align="start"
                      className="w-80 space-y-3"
                      side="top"
                    >
                      <p className="font-medium text-sm">
                        {t("chat.proxyContinuationHoverTitle")}
                      </p>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="text-xs">
                            {group.response.outcome === "continue"
                              ? t("chat.decisionOutcomeContinue")
                              : group.response.outcome === "complete"
                                ? t("chat.decisionOutcomeComplete")
                                : group.response.outcome === "ask_user"
                                  ? t("chat.decisionOutcomeAskUser")
                                  : t("chat.decisionOutcomeStopPath")}
                          </Badge>
                          <Badge
                            variant={
                              group.response.riskLevel === "high"
                                ? "destructive"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {group.response.riskLevel === "high"
                              ? t("chat.decisionRiskHigh")
                              : group.response.riskLevel === "medium"
                                ? t("chat.decisionRiskMedium")
                                : t("chat.decisionRiskLow")}
                          </Badge>
                        </div>
                        {group.response.reason ? (
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground text-xs">
                              {t("chat.decisionReason")}
                            </p>
                            <p className="whitespace-pre-wrap text-xs">
                              {group.response.reason}
                            </p>
                          </div>
                        ) : null}
                        {group.response.assumption ? (
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground text-xs">
                              {t("chat.decisionAssumption")}
                            </p>
                            <p className="whitespace-pre-wrap text-xs">
                              {group.response.assumption}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                  <span className="whitespace-pre-wrap wrap-break-word">
                    {group.response.suggestedContinuation.trim()}
                  </span>
                </MessageContent>
              </Message>
            );
          }

          // Show resolved decision outcome (complete / ask_user / stop_path)
          if (group.status === "resolved" && group.response) {
            return (
              <Message key={group.id} from="user">
                <MessageContent className="gap-2">
                  <HoverCard openDelay={200} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <Badge
                        variant="outline"
                        className="cursor-help gap-1 border-primary/30 text-xs text-primary/70 hover:text-primary"
                      >
                        <BotIcon className="size-3" />
                        {t("chat.proxyContinuationBadge")}
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent
                      align="start"
                      className="w-80 space-y-3"
                      side="top"
                    >
                      <p className="font-medium text-sm">
                        {t("chat.proxyContinuationHoverTitle")}
                      </p>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="text-xs">
                            {group.response.outcome === "continue"
                              ? t("chat.decisionOutcomeContinue")
                              : group.response.outcome === "complete"
                                ? t("chat.decisionOutcomeComplete")
                                : group.response.outcome === "ask_user"
                                  ? t("chat.decisionOutcomeAskUser")
                                  : t("chat.decisionOutcomeStopPath")}
                          </Badge>
                          <Badge
                            variant={
                              group.response.riskLevel === "high"
                                ? "destructive"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {group.response.riskLevel === "high"
                              ? t("chat.decisionRiskHigh")
                              : group.response.riskLevel === "medium"
                                ? t("chat.decisionRiskMedium")
                                : t("chat.decisionRiskLow")}
                          </Badge>
                        </div>
                        {group.response.reason ? (
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground text-xs">
                              {t("chat.decisionReason")}
                            </p>
                            <p className="whitespace-pre-wrap text-xs">
                              {group.response.reason}
                            </p>
                          </div>
                        ) : null}
                        {group.response.assumption ? (
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground text-xs">
                              {t("chat.decisionAssumption")}
                            </p>
                            <p className="whitespace-pre-wrap text-xs">
                              {group.response.assumption}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                  <span className="text-muted-foreground text-sm">
                    {group.response.outcome === "complete"
                      ? t("chat.decisionOutcomeComplete")
                      : group.response.outcome === "ask_user"
                        ? t("chat.decisionOutcomeAskUser")
                        : group.response.outcome === "stop_path"
                          ? t("chat.decisionOutcomeStopPath")
                          : ""}
                  </span>
                </MessageContent>
              </Message>
            );
          }

          return null;
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
