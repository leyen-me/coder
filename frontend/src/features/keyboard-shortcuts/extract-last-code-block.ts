const FENCED_CODE_BLOCK_PATTERN = /```[\w-]*\n([\s\S]*?)```/g;

export function extractLastCodeBlock(text: string): string | null {
  const matches = [...text.matchAll(FENCED_CODE_BLOCK_PATTERN)];
  if (matches.length === 0) {
    return null;
  }

  const lastMatch = matches[matches.length - 1];
  const code = lastMatch?.[1];
  if (!code) {
    return null;
  }

  return code.replace(/\n$/, "");
}
