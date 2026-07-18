//! Context compaction separator — visual divider at compaction boundaries.
//!
//! Detects system messages containing "Context Compaction Summary" that the
//! agent injects when auto-compact or /compact fires, and renders a subtle
//! separator banner so users can see where old context ends and new begins.


export type CompactBoundary = {
  /** Index in the message list where compaction occurred. */
  messageIndex: number;
  /** Short preview of the compact summary (first ~120 chars). */
  preview: string;
};

/**
 * Scan a list of messages for compaction boundaries.
 * Returns an array of boundary markers keyed by message index.
 */
export function detectCompactBoundaries(
  messages: { role: string; content?: unknown }[],
): CompactBoundary[] {
  return messages
    .map((msg, i) => {
      if (msg.role !== "system") return null;
      const text = extractStringContent(msg.content);
      if (!text) return null;
      if (!text.includes("Context Compaction Summary")) return null;

      // Extract the summary text after the header
      const summaryStart = text.indexOf("Context Compaction Summary");
      const preview = text.slice(summaryStart + 28).trim().slice(0, 120);

      return { messageIndex: i, preview };
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
