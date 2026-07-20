"use client";

import {
  CheckCircle2Icon,
  ChevronDownIcon,
  FoldVerticalIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type CompactProcessChipProps = {
  state: "running" | "completed" | "error";
  removedCount?: number;
  preview?: string;
  className?: string;
};

/**
 * Mid-turn auto-compact step — matches ToolInvocationChip visual language
 * (mono dotted link + expandable detail), not the session-level banner card.
 */
export function CompactProcessChip({
  state,
  removedCount = 0,
  preview,
  className,
}: CompactProcessChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const previewText = preview?.trim() ?? "";
  const canExpand = Boolean(previewText) && state !== "running";

  const label =
    state === "running"
      ? t("chat.compactInProgressTitle")
      : state === "error"
        ? t("chat.compactFailedTitle")
        : removedCount === 0
          ? t("chat.compactNoopTitle")
          : t("chat.compactBoundaryTitle");

  const detail =
    state === "running"
      ? t("chat.compactInProgress")
      : state === "error"
        ? t("chat.compactFailed")
        : removedCount === 0
          ? t("chat.compactNoopAlreadyFits")
          : t("chat.compactBoundaryFallback");

  return (
    <Collapsible
      className={cn("group/compact-chip w-full", className)}
      onOpenChange={(next) => {
        if (canExpand) {
          setOpen(next);
        }
      }}
      open={canExpand ? open : false}
    >
      <CollapsibleTrigger
        className={cn(
          "inline-flex items-center gap-1 font-mono text-xs",
          "text-sky-600 underline decoration-dotted underline-offset-2 transition-colors",
          "hover:text-sky-500 hover:decoration-solid",
          "dark:text-sky-400 dark:hover:text-sky-300",
          canExpand ? "cursor-pointer" : "cursor-default",
        )}
        disabled={!canExpand}
        type="button"
      >
        <CompactStatusIcon state={state} />
        <FoldVerticalIcon className="size-3 shrink-0 opacity-70" />
        <span>{label}</span>
        {state === "completed" && removedCount > 0 ? (
          <span className="text-muted-foreground/80">({removedCount})</span>
        ) : null}
        {canExpand ? (
          <ChevronDownIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-200",
              "group-data-[state=open]/compact-chip:rotate-180",
            )}
          />
        ) : null}
      </CollapsibleTrigger>

      {canExpand ? (
        <CollapsibleContent>
          <div className="mt-2 space-y-2 border-l-2 border-muted pl-3 text-xs text-muted-foreground">
            <p>{detail}</p>
            {previewText ? (
              <p className="whitespace-pre-wrap wrap-break-word">{previewText}</p>
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function CompactStatusIcon({
  state,
}: {
  state: CompactProcessChipProps["state"];
}) {
  if (state === "running") {
    return (
      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
    );
  }
  if (state === "error") {
    return <XCircleIcon className="size-3.5 shrink-0 text-destructive" />;
  }
  return <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-500" />;
}
