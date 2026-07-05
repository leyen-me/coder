import { injectReferencedSkillPromptBlocks } from "./build-skill-prompt-blocks";

const SKILL_REFERENCE_PATTERN = /(?:^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)/g;

export function extractSkillSlugsFromText(text: string): string[] {
  const slugs = new Set<string>();

  for (const match of text.matchAll(SKILL_REFERENCE_PATTERN)) {
    const slug = match[1];
    if (slug) {
      slugs.add(slug);
    }
  }

  return [...slugs];
}

export function injectReferencedSkillsIntoUserContent(
  content: string,
  skills: Array<{ slug: string; content: string }>
): string {
  return injectReferencedSkillPromptBlocks(content, skills);
}
