import {
  AlertCircleIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  FoldVerticalIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { SessionCompactUiPhase } from "../lib/session-compact-ui-store";

export type CompactBoundary = {
  messageIndex: number;
  preview: string;
};

const COMPACT_SUMMARY_MARKER = "## Context Compaction Summary";

export function isCompactMessage(message: {
  messageKind?: string | null;
  role?: string;
  content?: unknown;
}): boolean {
  if (message.messageKind === "compact") {
    return true;
  }

  if (message.role !== "system") {
    return false;
  }

  const text = extractStringContent(message.content);
  return Boolean(text?.includes("Context Compaction Summary"));
}

export function compactPreviewFromContent(content: string): string {
  const summaryStart = content.indexOf(COMPACT_SUMMARY_MARKER);
  const previewSource =
    summaryStart >= 0
      ? content.slice(summaryStart + COMPACT_SUMMARY_MARKER.length)
      : content;

  return previewSource.trim().slice(0, 120);
}

export function detectCompactBoundaries(
  messages: { role: string; content?: unknown; messageKind?: string | null }[],
): CompactBoundary[] {
  return messages
    .map((msg, index) => {
      if (!isCompactMessage(msg)) {
        return null;
      }

      const text = extractStringContent(msg.content) ?? "";
      return {
        messageIndex: index,
        preview: compactPreviewFromContent(text),
      };
    })
    .filter((boundary): boundary is CompactBoundary => boundary !== null);
}

function extractStringContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String(part.text)
          : "",
      )
      .join("");
  }
  if (typeof content === "object" && content !== null) {
    return String((content as Record<string, unknown>).text ?? "");
  }
  return null;
}

type CompactBoundaryBannerProps = {
  phase: SessionCompactUiPhase;
  titleKey: string;
  descriptionKey: string;
  titleParams?: Record<string, string | number>;
  description?: string;
  preview?: string;
  className?: string;
};

type PhasePresentation = {
  containerClassName: string;
  iconShellClassName: string;
  iconSize: "md" | "sm";
  roundedClassName: string;
};

function getPhasePresentation(phase: SessionCompactUiPhase): PhasePresentation {
  switch (phase) {
    case "error":
      return {
        containerClassName:
          "border-destructive/25 bg-destructive/5 dark:bg-destructive/10",
        iconShellClassName: "bg-destructive/10 text-destructive",
        iconSize: "sm",
        roundedClassName: "rounded-xl",
      };
    case "noop":
      return {
        containerClassName:
          "border-border/40 border-dashed bg-muted/15 dark:bg-muted/10",
        iconShellClassName: "bg-muted text-muted-foreground",
        iconSize: "sm",
        roundedClassName: "rounded-xl",
      };
    case "loading":
    case "queued":
      return {
        containerClassName:
          "border-border/50 bg-muted/25 dark:bg-muted/15",
        iconShellClassName: "bg-muted text-muted-foreground",
        iconSize: "sm",
        roundedClassName: "rounded-xl",
      };
    case "success":
    default:
      return {
        containerClassName:
          "border-border/60 bg-muted/20 dark:bg-muted/10",
        iconShellClassName: "bg-foreground/5 text-muted-foreground",
        iconSize: "md",
        roundedClassName: "rounded-2xl",
      };
  }
}

function PhaseIcon({
  phase,
  iconShellClassName,
  iconSize,
}: {
  phase: SessionCompactUiPhase;
  iconShellClassName: string;
  iconSize: "md" | "sm";
}) {
  const shellSize = iconSize === "md" ? "size-8" : "size-7";
  const glyphSize = iconSize === "md" ? "size-4" : "size-3.5";

  return (
    <div
      className={cn(
        "mt-0.5 flex shrink-0 items-center justify-center rounded-full",
        shellSize,
        iconShellClassName,
      )}
    >
      {phase === "loading" || phase === "queued" ? (
        <LoaderCircleIcon className={cn(glyphSize, "animate-spin")} />
      ) : phase === "error" ? (
        <AlertCircleIcon className={glyphSize} />
      ) : phase === "noop" ? (
        <CircleCheckIcon className={glyphSize} />
      ) : (
        <FoldVerticalIcon className={glyphSize} />
      )}
    </div>
  );
}

function CompactSummaryPreview({ preview }: { preview: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!preview.trim()) {
    return null;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group inline-flex items-center gap-1 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline">
        {open ? t("chat.compactHideSummary") : t("chat.compactViewSummary")}
        <ChevronDownIcon
          className={cn(
            "size-3.5 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <p className="whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
          {preview}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CompactBoundaryBanner({
  phase,
  titleKey,
  descriptionKey,
  titleParams,
  description,
  preview,
  className,
}: CompactBoundaryBannerProps) {
  const { t } = useTranslation();
  const presentation = getPhasePresentation(phase);
  const title = t(titleKey, titleParams);
  const body = description ?? t(descriptionKey, titleParams);
  const isMilestone = phase === "success";

  if (isMilestone) {
    return (
      <div
        className={cn(
          "overflow-hidden border px-4 py-3",
          presentation.roundedClassName,
          presentation.containerClassName,
          className,
        )}
        data-compact-phase={phase}
      >
        <div className="flex items-start gap-3">
          <PhaseIcon
            phase={phase}
            iconShellClassName={presentation.iconShellClassName}
            iconSize={presentation.iconSize}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground text-sm">{title}</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {body}
            </p>
            {preview ? <CompactSummaryPreview preview={preview} /> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden border px-3 py-2.5",
        presentation.roundedClassName,
        presentation.containerClassName,
        className,
      )}
      data-compact-phase={phase}
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <PhaseIcon
          phase={phase}
          iconShellClassName={presentation.iconShellClassName}
          iconSize={presentation.iconSize}
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium text-foreground text-sm">{title}</p>
          <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use CompactBoundaryBanner */
export function CompactSeparator({
  boundary,
}: {
  boundary: CompactBoundary;
}) {
  return (
    <CompactBoundaryBanner
      phase="success"
      titleKey="chat.compactBoundaryTitle"
      descriptionKey="chat.compactBoundaryFallback"
      preview={boundary.preview}
    />
  );
}

export function compactBannerFromUiState(input: {
  phase: SessionCompactUiPhase;
  i18nKey: string;
  i18nParams?: Record<string, string | number>;
  preview?: string;
}) {
  const titleKey =
    input.phase === "loading"
      ? "chat.compactInProgressTitle"
      : input.phase === "queued"
        ? "chat.compactQueuedTitle"
        : input.phase === "success"
          ? "chat.compactBoundaryTitle"
          : input.phase === "noop"
            ? "chat.compactNoopTitle"
            : "chat.compactFailedTitle";

  return {
    phase: input.phase,
    titleKey,
    descriptionKey: input.i18nKey,
    titleParams: input.i18nParams,
    preview: input.preview,
  };
}
