import type { SystemSkillDefinition } from "../types";
import { SYSTEM_SKILLS } from "./catalog";

export { SYSTEM_SKILLS };

const slugSet = new Set<string>();

for (const skill of SYSTEM_SKILLS) {
  if (slugSet.has(skill.slug)) {
    throw new Error(`Duplicate system skill slug: ${skill.slug}`);
  }
  slugSet.add(skill.slug);
}

export function getSystemSkillBySlug(
  slug: string
): SystemSkillDefinition | null {
  return SYSTEM_SKILLS.find((skill) => skill.slug === slug) ?? null;
}

export function getSystemSkillById(id: string): SystemSkillDefinition | null {
  return SYSTEM_SKILLS.find((skill) => skill.id === id) ?? null;
}

export function getAllSystemSkillSlugs(): Set<string> {
  return new Set(SYSTEM_SKILLS.map((skill) => skill.slug));
}
