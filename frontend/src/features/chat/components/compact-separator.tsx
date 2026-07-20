import {
  AlertCircleIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  FoldVerticalIcon,
  LoaderCircleIcon,
} from "lucide-react";

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

  return previewSource.trim();
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
        preview: compactPreviewFromContent(text).slice(0, 120),
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
  roundedClassName: string;
  compact: boolean;
};

function getPhasePresentation(phase: SessionCompactUiPhase): PhasePresentation {
  switch (phase) {
    case "error":
      return {
        containerClassName:
          "border-destructive/25 bg-destructive/5 dark:bg-destructive/10",
        iconShellClassName: "bg-destructive/10 text-destructive",
        roundedClassName: "rounded-xl",
        compact: true,
      };
    case "noop":
      return {
        containerClassName:
          "border-border/40 border-dashed bg-muted/15 dark:bg-muted/10",
        iconShellClassName: "bg-muted text-muted-foreground",
        roundedClassName: "rounded-xl",
        compact: true,
      };
    case "loading":
    case "queued":
      return {
        containerClassName:
          "border-border/50 bg-muted/25 dark:bg-muted/15",
        iconShellClassName: "bg-muted text-muted-foreground",
        roundedClassName: "rounded-xl",
        compact: true,
      };
    case "success":
    default:
      return {
        containerClassName:
          "border-border/60 bg-muted/20 dark:bg-muted/10",
        iconShellClassName: "bg-foreground/5 text-muted-foreground",
        roundedClassName: "rounded-2xl",
        compact: false,
      };
  }
}

function PhaseIcon({
  phase,
  iconShellClassName,
  compact,
}: {
  phase: SessionCompactUiPhase;
  iconShellClassName: string;
  compact: boolean;
}) {
  const shellSize = compact ? "size-7" : "size-8";
  const glyphSize = compact ? "size-3.5" : "size-4";

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

function CompactSummaryCollapsible({ preview }: { preview: string }) {
  const { t } = useTranslation();
  const trimmed = preview.trim();

  if (!trimmed) {
    return null;
  }

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="group inline-flex items-center gap-1 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline">
        {t("chat.compactViewSummary")}
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <p className="whitespace-pre-wrap rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 text-muted-foreground text-sm leading-relaxed dark:bg-background/20">
          {trimmed}
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

  return (
    <div
      className={cn(
        "overflow-hidden border",
        presentation.roundedClassName,
        presentation.containerClassName,
        presentation.compact ? "px-3 py-2.5" : "px-4 py-3",
        className,
      )}
      data-compact-phase={phase}
      role={phase === "success" ? undefined : "status"}
    >
      <div
        className={cn(
          "flex items-start",
          presentation.compact ? "gap-2.5" : "gap-3",
        )}
      >
        <PhaseIcon
          phase={phase}
          compact={presentation.compact}
          iconShellClassName={presentation.iconShellClassName}
        />
        <div
          className={cn(
            "min-w-0 flex-1",
            presentation.compact ? "space-y-0.5" : "space-y-1",
          )}
        >
          <p className="font-medium text-foreground text-sm">{title}</p>
          {body ? (
            <p className="text-muted-foreground text-sm leading-relaxed">
              {body}
            </p>
          ) : null}
          {preview && phase === "success" ? (
            <CompactSummaryCollapsible preview={preview} />
          ) : null}
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
