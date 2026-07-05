import { buildTitledPromptBlock, joinPromptBlocks } from "@/features/agent/prompt-blocks";

export type PromptSkill = {
  slug: string;
  content: string;
};

export function buildReferencedSkillPromptBlocks(
  skills: PromptSkill[]
): string[] {
  return skills.map((skill) =>
    buildTitledPromptBlock(`Referenced skill: ${skill.slug}`, [
      skill.content.trim(),
    ])
  );
}

export function injectReferencedSkillPromptBlocks(
  content: string,
  skills: PromptSkill[]
): string {
  if (skills.length === 0) {
    return content;
  }

  return joinPromptBlocks([
    ...buildReferencedSkillPromptBlocks(skills),
    content,
  ]);
}
