"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BotIcon, ChevronDownIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { AssistantProcessStep } from "./assistant-process";
import { AssistantProcessView } from "./assistant-process-view";

const AUTO_CLOSE_DELAY_MS = 1000;
const MS_IN_S = 1000;

type AssistantProcessCollapsibleProps = {
  steps: AssistantProcessStep[];
  answerText: string;
  isStreaming: boolean;
  taskId?: string | null;
};

export const AssistantProcessCollapsible = memo(
  function AssistantProcessCollapsible({
    steps,
    answerText,
    isStreaming,
    taskId,
  }: AssistantProcessCollapsibleProps) {
    const { t } = useTranslation();

    // -- open/closed state --
    const [isOpen, setIsOpen] = useState(isStreaming);
    const hasEverStreamedRef = useRef(false);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);

    // -- duration tracking --
    const startTimeRef = useRef<number | null>(null);
    const [duration, setDuration] = useState<number | undefined>(undefined);

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

    // Strip answer steps from the internal process view — the answer is
    // always rendered outside the collapsible so it stays visible even
    // when the panel is collapsed.
    const interiorSteps = useMemo(
      () => steps.filter((s) => s.kind !== "answer"),
      [steps]
    );
    const hasInteriorContent = interiorSteps.length > 0;

    const triggerLabel = useMemo(() => {
      if (isStreaming) {
        return t("chat.thinkingInProgress");
      }

      const parts: string[] = [];

      if (toolCount > 0) {
        parts.push(t("chat.agentToolCalls", { count: toolCount }));
      }

      if (duration !== undefined) {
        parts.push(t("chat.agentProcessSeconds", { duration }));
      }

      return parts.length > 0 ? parts.join(" · ") : t("chat.agentProcess");
    }, [isStreaming, toolCount, duration, t]);

    const handleOpenChange = useCallback(
      (open: boolean) => {
        setIsOpen(open);
      },
      []
    );

    return (
      <Collapsible
        className="not-prose w-full overflow-hidden"
        onOpenChange={handleOpenChange}
        open={isOpen}
      >
        <CollapsibleTrigger
          className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={
            isOpen ? t("chat.queueCollapse") : t("chat.queueExpand")
          }
        >
          <BotIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 transition-transform",
              isOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </CollapsibleTrigger>

        {/* Unmount interior content when collapsed — saves DOM nodes for long conversations */}
        {isOpen && hasInteriorContent ? (
          <CollapsibleContent
            className={cn(
              "mt-2 rounded-lg border bg-muted/15 p-4",
              "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
            )}
          >
            <AssistantProcessView steps={interiorSteps} taskId={taskId} />
          </CollapsibleContent>
        ) : null}

        {/* Final answer is always outside the collapsible — visible whether
            the panel is open or collapsed. */}
        {answerText ? (
          <div className="mt-3">
            <AssistantProcessView
              steps={[
                {
                  id: "answer:standalone",
                  kind: "answer",
                  text: answerText,
                  isStreaming,
                },
              ]}
              taskId={taskId}
            />
          </div>
        ) : null}
      </Collapsible>
    );
  }
);
