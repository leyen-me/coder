//! Context compaction separator — visual divider at compaction boundaries.
//!
//! Detects persisted compact marker messages (`messageKind: compact`) and
//! renders a subtle separator banner at the compaction boundary.


export type CompactBoundary = {
  /** Index in the message list where compaction occurred. */
  messageIndex: number;
  /** Short preview of the compact summary (first ~120 chars). */
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

/**
 * Scan a list of messages for compaction boundaries.
 * Returns an array of boundary markers keyed by message index.
 */
export function detectCompactBoundaries(
  messages: { role: string; content?: unknown; messageKind?: string | null }[],
): CompactBoundary[] {
  return messages
    .map((msg, i) => {
      if (!isCompactMessage(msg)) {
        return null;
      }

      const text = extractStringContent(msg.content) ?? "";
      return {
        messageIndex: i,
        preview: compactPreviewFromContent(text),
      };
    })
    .filter((b): b is CompactBoundary => b !== null);
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

/**
 * React component rendering a compact separator banner.
 */
export function CompactSeparator({
  boundary,
}: {
  boundary: CompactBoundary;
}) {
  return (
    <div className="flex items-center justify-center gap-2 py-2 my-1">
      <div className="flex-1 border-t border-muted-foreground/20" />
      <div className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md bg-muted/40 border border-border/30 text-xs text-muted-foreground max-w-[80%]">
        <span className="font-medium text-[10px] uppercase tracking-wider opacity-60">
          Context Compacted
        </span>
        <span className="text-[11px] leading-tight text-center line-clamp-2">
          {boundary.preview || "History summarized for continuation."}
        </span>
      </div>
      <div className="flex-1 border-t border-muted-foreground/20" />
    </div>
  );
}
