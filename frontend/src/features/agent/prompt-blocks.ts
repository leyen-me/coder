export const PROMPT_BLOCK_SEPARATOR = "\n\n---\n\n";

export function joinPromptBlocks(blocks: Array<string | null | undefined>): string {
  return blocks
    .map((block) => block?.trim())
    .filter((block): block is string => Boolean(block))
    .join(PROMPT_BLOCK_SEPARATOR);
}

export function buildTitledPromptBlock(
  title: string,
  bodyLines: string[]
): string {
  return [`## ${title}`, "", ...bodyLines].join("\n").trim();
}
