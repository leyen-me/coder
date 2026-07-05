"use client";

import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BotIcon, ChevronDownIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

import {
  getAssistantProcessInteriorSteps,
  type AssistantProcessStep,
} from "./assistant-process";
import { AssistantProcessView } from "./assistant-process-view";
import { StreamingMessageContent } from "./streaming-message-content";

const AUTO_CLOSE_DELAY_MS = 1000;
const MS_IN_S = 1000;

type AssistantProcessCollapsibleProps = {
  steps: AssistantProcessStep[];
  answerText: string;
  isStreaming: boolean;
  taskId?: string | null;
  /** Persisted duration from the message record (ms). Available on re-open. */
  durationMs?: number;
};

export const AssistantProcessCollapsible = memo(
  function AssistantProcessCollapsible({
    steps,
    answerText,
    isStreaming,
    taskId,
    durationMs: persistedDurationMs,
  }: AssistantProcessCollapsibleProps) {
    const { t } = useTranslation();

    // -- open/closed state --
    const [isOpen, setIsOpen] = useState(isStreaming);
    const hasEverStreamedRef = useRef(false);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);

    // -- duration tracking --
    const startTimeRef = useRef<number | null>(null);
    // Use the persisted duration when available (historical view), otherwise
    // compute in-memory during live streaming.
    const [duration, setDuration] = useState<number | undefined>(
      persistedDurationMs !== undefined
        ? Math.ceil(persistedDurationMs / MS_IN_S)
        : undefined
    );

    // Track streaming lifecycle
    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming]);

    // Auto-open when streaming starts
    useEffect(() => {
      if (isStreaming && !isOpen) {
        setIsOpen(true);
      }
    }, [isStreaming, isOpen]);

    // Auto-close when streaming ends (once only, with a short delay)
    useEffect(() => {
      if (
        hasEverStreamedRef.current &&
        !isStreaming &&
        isOpen &&
        !hasAutoClosed
      ) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY_MS);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, hasAutoClosed]);

    // -- summary for the trigger bar --
    const toolCount = useMemo(
      () => steps.filter((s) => s.kind === "tool").length,
      [steps]
    );

    // Keep answer steps in the interior view during streaming so the user
    // can see the answer being written in real time. After the turn finishes,
    // the answer moves outside the collapsible.
    const interiorSteps = useMemo(
      () =>
        getAssistantProcessInteriorSteps({
          steps,
          isMessageStreaming: isStreaming,
        }),
      [isStreaming, steps]
    );
    const hasInteriorContent = interiorSteps.length > 0;

    const triggerLabel = useMemo(() => {
      if (isStreaming) {
        return t("chat.thinkingInProgress");
      }

      const parts: string[] = [t("chat.thinkingCompleted")];

      if (toolCount > 0) {
        parts.push(t("chat.agentToolCalls", { count: toolCount }));
      }

      if (duration !== undefined) {
        parts.push(
          t("chat.durationLabel", { duration: formatDuration(duration) })
        );
      }

      return parts.join(" / ");
    }, [isStreaming, toolCount, duration, t]);

    const handleOpenChange = useCallback(
      (open: boolean) => {
        setIsOpen(open);
      },
      []
    );

    return (
      <Collapsible
        className="not-prose w-full"
        onOpenChange={handleOpenChange}
        open={isOpen}
      >
        <CollapsibleTrigger
          className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label={
            isOpen ? t("chat.queueCollapse") : t("chat.queueExpand")
          }
        >
          <BotIcon className="size-4 shrink-0" />
          <span>{triggerLabel}</span>
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 transition-transform",
              isOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </CollapsibleTrigger>

        {/* Unmount interior content when collapsed — saves DOM nodes for long conversations */}
        {isOpen && hasInteriorContent ? (
          <div className="mt-4 border-l-2 border-muted pl-4 text-muted-foreground">
            <AssistantProcessView steps={interiorSteps} taskId={taskId} />
          </div>
        ) : null}

        {/* Final answer outside the collapsible — only rendered after the
            turn finishes, so the panel has already auto-closed by then. */}
        {!isStreaming && answerText ? (
          <div className="mt-4">
            <StreamingMessageContent text={answerText} />
          </div>
        ) : null}
      </Collapsible>
    );
  }
);

/** Format a duration in seconds to a human-readable short string. */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
