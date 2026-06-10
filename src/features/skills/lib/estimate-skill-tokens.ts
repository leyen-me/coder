/** Rough token estimate (~4 chars per token) for skill content budgeting. */
export function estimateSkillTokens(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.ceil(trimmed.length / 4);
}

export const SYSTEM_SKILL_PROMPT_BUDGET_CHARS = 8 * 1024;

export function truncateSkillContent(
  content: string,
  maxChars: number
): { content: string; truncated: boolean } {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) {
    return { content: trimmed, truncated: false };
  }

  return {
    content: `${trimmed.slice(0, maxChars).trimEnd()}\n\n[…truncated]`,
    truncated: true,
  };
}
