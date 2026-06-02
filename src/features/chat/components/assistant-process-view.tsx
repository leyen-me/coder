"use client";

import {
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import {
  BrainIcon,
  CheckCircle2Icon,
  CircleIcon,
  MessageSquareTextIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback } from "react";
import type { ReactNode } from "react";

import type { AssistantProcessStep } from "./assistant-process";
import { MessageToolItem } from "./message-tool-list";

type AssistantProcessViewProps = {
  steps: AssistantProcessStep[];
};

export function AssistantProcessView({ steps }: AssistantProcessViewProps) {
  const { t } = useTranslation();

  const getThinkingMessage = useCallback(
    (streaming: boolean, duration?: number) => {
      if (streaming || duration === 0) {
        return <Shimmer duration={1}>{t("chat.thinkingInProgress")}</Shimmer>;
      }
      if (duration === undefined) {
        return <p>{t("chat.thinking")}</p>;
      }
      return <p>{t("chat.thoughtForSeconds", { duration })}</p>;
    },
    [t]
  );

  return (
    <div className="flex w-full flex-col gap-3">
      {steps.map((step, index) => (
        <ProcessStep
          icon={getStepIcon(step)}
          isLast={index === steps.length - 1}
          key={step.id}
        >
          {step.kind === "reasoning" ? (
            <Reasoning className="mb-0 w-full" isStreaming={step.isStreaming}>
              <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
              <ReasoningContent>
                {step.text || t("chat.thinkingPlaceholder")}
              </ReasoningContent>
            </Reasoning>
          ) : null}

          {step.kind === "tool" ? (
            <MessageToolItem className="mb-0" invocation={step.invocation} />
          ) : null}

          {step.kind === "answer" ? (
            <div className="space-y-2">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {t("chat.answer")}
              </p>
              <MessageContent className="group-[.is-assistant]:overflow-visible group-[.is-assistant]:bg-transparent group-[.is-assistant]:p-0">
                <MessageResponse isAnimating={step.isStreaming}>
                  {step.text}
                </MessageResponse>
              </MessageContent>
            </div>
          ) : null}
        </ProcessStep>
      ))}
    </div>
  );
}

function ProcessStep({
  icon,
  isLast,
  children,
}: {
  icon: ReactNode;
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <div className="rounded-full border bg-background p-1.5 text-muted-foreground shadow-sm">
          {icon}
        </div>
        {!isLast ? <div className="mt-2 min-h-6 w-px flex-1 bg-border" /> : null}
      </div>
      <div className={cn("min-w-0 pb-1", !isLast && "pb-2")}>{children}</div>
    </div>
  );
}

function getStepIcon(step: AssistantProcessStep) {
  if (step.kind === "reasoning") {
    return <BrainIcon className="size-4" />;
  }

  if (step.kind === "answer") {
    return <MessageSquareTextIcon className="size-4" />;
  }

  switch (step.invocation.state) {
    case "output-available":
      return <CheckCircle2Icon className="size-4 text-green-600" />;
    case "output-error":
      return <XCircleIcon className="size-4 text-destructive" />;
    case "input-available":
      return <WrenchIcon className="size-4 animate-pulse" />;
    default:
      return <CircleIcon className="size-4" />;
  }
}
