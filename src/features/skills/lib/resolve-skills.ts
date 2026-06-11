import {
  getUserSkillBySlug,
  listSystemSkillPreferences,
  listUserSkills,
} from "@/lib/db";

import {
  extractSkillSlugsFromText,
} from "./parse-skill-references";
import {
  SYSTEM_SKILL_PROMPT_BUDGET_CHARS,
  truncateSkillContent,
} from "./estimate-skill-tokens";
import {
  getAllSystemSkillSlugs,
  getSystemSkillBySlug,
  SYSTEM_SKILLS,
} from "../system/registry";
import type {
  ResolvedSkill,
  SkillCardViewModel,
  SkillListItem,
} from "../types";

async function resolveSystemSkillEnabled(
  skillId: string,
  defaultEnabled: boolean
): Promise<boolean> {
  const preferences = await listSystemSkillPreferences();
  const preference = preferences.find((item) => item.skillId === skillId);
  return preference?.enabled ?? defaultEnabled;
}

export async function isSystemSkillEnabled(
  skillId: string,
  defaultEnabled: boolean
): Promise<boolean> {
  return resolveSystemSkillEnabled(skillId, defaultEnabled);
}

export async function getEnabledSystemSkills(): Promise<ResolvedSkill[]> {
  const preferences = await listSystemSkillPreferences();
  const preferenceMap = new Map(
    preferences.map((preference) => [preference.skillId, preference.enabled])
  );

  const enabled = SYSTEM_SKILLS.filter((skill) => {
    const enabledValue = preferenceMap.get(skill.id);
    return enabledValue ?? skill.defaultEnabled;
  });

  let remainingBudget = SYSTEM_SKILL_PROMPT_BUDGET_CHARS;
  const resolved: ResolvedSkill[] = [];

  for (const skill of enabled) {
    if (remainingBudget <= 0) {
      break;
    }

    const { content, truncated } = truncateSkillContent(
      skill.content,
      remainingBudget
    );
    remainingBudget -= content.length;

    resolved.push({
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      content: truncated
        ? `${content}\n\nNote: This skill was truncated to fit the system prompt budget.`
        : content,
      source: "system",
    });
  }

  return resolved;
}

export async function getEnabledUserSkills(): Promise<ResolvedSkill[]> {
  const skills = await listUserSkills();
  return skills
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      content: skill.content,
      source: "user" as const,
    }));
}

export async function listEnabledSkillsForTools(): Promise<SkillListItem[]> {
  const userSkills = await listUserSkills();

  return userSkills
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      source: "user" as const,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readEnabledSkillBySlug(slug: string): Promise<
  | ResolvedSkill
  | { error: "not_found" | "not_enabled" }
> {
  if (getSystemSkillBySlug(slug)) {
    return { error: "not_found" };
  }

  const userSkill = await getUserSkillBySlug(slug);
  if (!userSkill) {
    return { error: "not_found" };
  }

  if (!userSkill.enabled) {
    return { error: "not_enabled" };
  }

  return {
    id: userSkill.id,
    slug: userSkill.slug,
    name: userSkill.name,
    description: userSkill.description,
    content: userSkill.content,
    source: "user",
  };
}

export async function resolveEnabledSkillsBySlugs(
  slugs: string[]
): Promise<
  | { ok: true; skills: ResolvedSkill[] }
  | { ok: false; error: "not_found" | "not_enabled"; slug: string }
> {
  const uniqueSlugs = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  const resolved: ResolvedSkill[] = [];

  for (const slug of uniqueSlugs) {
    const result = await readEnabledSkillBySlug(slug);
    if ("error" in result) {
      return { ok: false, error: result.error, slug };
    }

    resolved.push(result);
  }

  return { ok: true, skills: resolved };
}

export async function getSystemSkillCards(): Promise<SkillCardViewModel[]> {
  let preferences: Awaited<ReturnType<typeof listSystemSkillPreferences>> = [];
  try {
    preferences = await listSystemSkillPreferences();
  } catch (error) {
    console.warn("Failed to load system skill preferences", error);
  }

  const preferenceMap = new Map(
    preferences.map((preference) => [preference.skillId, preference.enabled])
  );

  return SYSTEM_SKILLS.map((skill) => {
    const enabled = preferenceMap.get(skill.id) ?? skill.defaultEnabled;
    return {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      content: skill.content,
      source: "system" as const,
      enabled,
      estimatedTokens: Math.ceil(skill.content.length / 4),
    };
  });
}

/** Fallback when IndexedDB is unavailable — uses defaultEnabled only. */
export function getSystemSkillCardsSync(): SkillCardViewModel[] {
  return SYSTEM_SKILLS.map((skill) => ({
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    source: "system" as const,
    enabled: skill.defaultEnabled,
    estimatedTokens: Math.ceil(skill.content.length / 4),
  }));
}

export async function getUserSkillCards(): Promise<SkillCardViewModel[]> {
  const systemSlugs = getAllSystemSkillSlugs();
  const skills = await listUserSkills();

  return skills.map((skill) => ({
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    source: "user" as const,
    enabled: skill.enabled,
    estimatedTokens: Math.ceil(skill.content.length / 4),
  })).filter((skill) => !systemSlugs.has(skill.slug));
}

export async function validateSkillReferencesForSend(
  content: string
): Promise<
  | { ok: true; slugs: string[] }
  | { ok: false; error: "not_found" | "not_enabled"; slug: string }
> {
  const slugs = extractSkillSlugsFromText(content);
  if (slugs.length === 0) {
    return { ok: true, slugs: [] };
  }

  return resolveEnabledSkillsBySlugs(slugs).then((result) =>
    result.ok ? { ok: true, slugs } : result
  );
}

export function assertUserSkillSlugAvailable(
  slug: string,
  existingUserSlug?: string
): void {
  if (slug === existingUserSlug) {
    return;
  }

  if (getSystemSkillBySlug(slug)) {
    throw new Error("Slug conflicts with a system skill");
  }
}
