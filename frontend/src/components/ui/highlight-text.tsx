import type { ReactNode } from "react";

type HighlightTextProps = {
  text: string;
  query: string;
};

/**
 * Renders text with matching portions wrapped in a highlighted span.
 * Query is split by whitespace; each word is matched case-insensitively.
 */
export function HighlightText({ text, query }: HighlightTextProps) {
  const trimmed = query.trim();
  if (!trimmed) {
    return <>{text}</>;
  }

  const words = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (words.length === 0) {
    return <>{text}</>;
  }

  const pattern = new RegExp(`(${words.join("|")})`, "gi");
  const parts = text.split(pattern);

  const nodes: ReactNode[] = parts.map((part, i) => {
    if (pattern.test(part)) {
      // Reset lastIndex since we're reusing the regex
      pattern.lastIndex = 0;
      return (
        <mark
          key={i}
          className="rounded-sm bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-600/40"
        >
          {part}
        </mark>
      );
    }
    return part;
  });

  return <>{nodes}</>;
}
