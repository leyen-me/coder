"use client";

import {
  Reasoning,
  ReasoningTrigger,
  useReasoning,
} from "@/components/ai-elements/reasoning";
import { MessageResponse } from "@/components/ai-elements/message";
import { CollapsibleContent } from "@/components/ui/collapsible";
import {
  parseStoredHandoffArtifact,
  type ParsedHandoffArtifact,
} from "@/features/agent/handoff";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { ArrowRightLeftIcon, ChevronDownIcon } from "lucide-react";
import { useMemo } from "react";

type HandoffArtifactBlockProps = {
  content: string;
  defaultOpen?: boolean;
  className?: string;
};

export function HandoffArtifactBlock({
  content,
  defaultOpen = false,
  className,
}: HandoffArtifactBlockProps) {
  const parsed = useMemo(
    () => parseStoredHandoffArtifact(content),
    [content]
  );

  if (!parsed) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 dark:bg-amber-500/10",
          className
        )}
      >
        <MessageResponse>{content}</MessageResponse>
      </div>
    );
  }

  return (
    <Reasoning
      className={cn("mb-0 w-full", className)}
      defaultOpen={defaultOpen}
      isStreaming={false}
    >
      <HandoffArtifactTrigger parsed={parsed} />
      <CollapsibleContent
        className={cn(
          "mt-3 space-y-3 outline-none",
          "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in"
        )}
      >
        <HandoffMetadataGrid parsed={parsed} />
        {parsed.body ? (
          <div className="rounded-xl border bg-background/80 px-4 py-3 dark:bg-background/40">
            <MessageResponse>{parsed.body}</MessageResponse>
          </div>
        ) : null}
      </CollapsibleContent>
    </Reasoning>
  );
}

type HandoffArtifactTriggerProps = {
  parsed: ParsedHandoffArtifact;
};

function HandoffArtifactTrigger({ parsed }: HandoffArtifactTriggerProps) {
  const { t } = useTranslation();
  const { isOpen } = useReasoning();
  const subtitle =
    parsed.sourceSessionTitle?.trim() ||
    parsed.sourceSessionId ||
    t("chat.handoffArtifactSubtitle");

  return (
    <ReasoningTrigger
      className={cn(
        "w-full rounded-2xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-left dark:bg-amber-500/10",
        "hover:bg-amber-500/10 dark:hover:bg-amber-500/15"
      )}
    >
      <ArrowRightLeftIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground text-sm">
          {t("chat.handoffArtifactTitle")}
        </p>
        <p className="truncate text-muted-foreground text-xs">{subtitle}</p>
      </div>
      <ChevronDownIcon
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform",
          isOpen ? "rotate-180" : "rotate-0"
        )}
      />
    </ReasoningTrigger>
  );
}

type HandoffMetadataGridProps = {
  parsed: ParsedHandoffArtifact;
};

function HandoffMetadataGrid({ parsed }: HandoffMetadataGridProps) {
  const { t } = useTranslation();
  const items = [
    parsed.sourceSessionTitle
      ? {
          label: t("chat.handoffMetadataSourceSession"),
          value: parsed.sourceSessionTitle,
        }
      : null,
    parsed.contextBudget
      ? {
          label: t("chat.handoffMetadataContextBudget"),
          value: parsed.contextBudget,
        }
      : null,
    parsed.generatedAt
      ? {
          label: t("chat.handoffMetadataGeneratedAt"),
          value: formatHandoffTimestamp(parsed.generatedAt),
        }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          className="rounded-lg border bg-muted/30 px-3 py-2 dark:bg-muted/10"
          key={item.label}
        >
          <p className="text-muted-foreground text-xs">{item.label}</p>
          <p className="mt-0.5 break-words text-foreground text-sm">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function formatHandoffTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
