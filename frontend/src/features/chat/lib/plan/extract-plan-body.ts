const PLAN_HEADING_PATTERN = /^#{1,3}\s+/m;

/** Trailing paragraphs that are meta/conversational, not part of the plan. */
const TRAILING_META_PATTERNS: readonly RegExp[] = [
  /^你觉得/u,
  /^如果确认/u,
  /^有些细节/u,
  /^这个方向/u,
  /^需要我/u,
  /^我可以生成/u,
  /^请告诉我/u,
  /^What do you think/i,
  /^Let me know/i,
  /^If you('re| are) happy/i,
  /Build with Agent/i,
  /点击.*Build/i,
  /生成.*plan\.md/i,
];

/**
 * Strips conversational preamble/postamble from a plan-mode assistant reply
 * so Build only sends the actionable plan body.
 */
export function extractPlanBodyForExecution(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  const headingMatch = trimmed.match(PLAN_HEADING_PATTERN);
  const bodyStart = headingMatch?.index ?? 0;
  let body = trimmed.slice(bodyStart).trim();

  const paragraphs = body.split(/\n\n+/);
  while (paragraphs.length > 1) {
    const last = paragraphs.at(-1)?.trim() ?? "";
    if (isTrailingMetaParagraph(last)) {
      paragraphs.pop();
      continue;
    }
    break;
  }

  body = paragraphs.join("\n\n").trim();

  // Drop a trailing horizontal rule left after removing meta paragraphs.
  return body.replace(/\n*---\s*$/u, "").trim();
}

function isTrailingMetaParagraph(paragraph: string): boolean {
  if (!paragraph) {
    return false;
  }

  return TRAILING_META_PATTERNS.some((pattern) => pattern.test(paragraph));
}
