import { LoaderCircleIcon } from "lucide-react";

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
  const isPending = phase === "loading" || phase === "queued";
  const isError = phase === "error";
  const isNoop = phase === "noop";

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 py-2 my-1",
        className,
      )}
      data-compact-phase={phase}
    >
      <div className="flex-1 border-t border-muted-foreground/20" />
      <div
        className={cn(
          "flex max-w-[80%] flex-col items-center gap-1 rounded-md border px-3 py-1.5 text-xs",
          isError
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : isNoop
              ? "border-border/30 bg-muted/30 text-muted-foreground"
              : "border-border/30 bg-muted/40 text-muted-foreground",
        )}
      >
        <div className="flex items-center gap-1.5">
          {isPending ? (
            <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin opacity-70" />
          ) : null}
          <span className="font-medium text-[10px] uppercase tracking-wider opacity-70">
            {t(titleKey, titleParams)}
          </span>
        </div>
        <span className="text-[11px] leading-tight text-center">
          {description ?? t(descriptionKey, titleParams)}
        </span>
        {preview && phase === "success" ? (
          <span className="text-[11px] leading-tight text-center line-clamp-2 opacity-80">
            {preview}
          </span>
        ) : null}
      </div>
      <div className="flex-1 border-t border-muted-foreground/20" />
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
