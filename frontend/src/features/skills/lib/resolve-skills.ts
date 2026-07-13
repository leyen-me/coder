import { listUserSkills as listUserSkillsApi, resolveSkillReferencesBySlugs } from "../api";
import { SYSTEM_MODULES } from "../system/registry";
import type {
  ResolvedSkill,
  SystemModuleCardViewModel,
  UserSkillCardViewModel,
} from "../types";

export function getSystemModules(): ResolvedSystemModule[] {
  return SYSTEM_MODULES.map((module) => ({
    id: module.id,
    slug: module.slug,
    name: module.name,
    description: module.description,
    content: module.content,
  }));
}

export type ResolvedSystemModule = {
  id: string;
  slug: string;
  name: string;
  description: string;
  content: string;
};

export function getSystemModuleCards(): SystemModuleCardViewModel[] {
  return SYSTEM_MODULES.map((module) => ({
    id: module.id,
    slug: module.slug,
    name: module.name,
    description: module.description,
    content: module.content,
    estimatedTokens: Math.ceil(module.content.length / 4),
  }));
}

export async function getUserSkillCards(): Promise<{
  rootPath: string;
  skills: UserSkillCardViewModel[];
}> {
  return listUserSkillsApi();
}

/**
 * Throws if the given slug is already taken by a system module.
 * When `currentSlug` is provided and matches `slug`, the check passes
 * (allowing the caller to reuse its own slug on update).
 */
export function assertUserSkillSlugAvailable(
  slug: string,
  currentSlug?: string
): void {
  // Allow re-using the same slug on update
  if (currentSlug === slug) {
    return;
  }

  // Check system modules
  const systemModule = SYSTEM_MODULES.find((m) => m.slug === slug);
  if (systemModule) {
    throw new Error(`Skill slug "${slug}" is reserved by a system module`);
  }
}

/**
 * Returns all enabled skills (system modules + user skills) for tool use.
 */
export async function listEnabledSkillsForTools(): Promise<any[]> {
  const systemModules = getSystemModules();
  const userSkills = await getUserSkillCards();

  // System modules are always enabled
  // User skills: only include those that are enabled
  const enabledUserSkills = userSkills.skills.filter(
    (s) => (s as any).enabled !== false
  );

  return [
    ...systemModules.map((m) => ({
      slug: m.slug,
      name: m.name,
      description: m.description,
      content: m.content,
      source: "system" as const,
      enabled: true,
    })),
    ...enabledUserSkills.map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      content: s.content,
      source: s.source,
      enabled: true,
    })),
  ];
}

/**
 * Reads a single enabled skill by slug, searching system modules first,
 * then user skills.
 */
export async function readEnabledSkillBySlug(
  slug: string
): Promise<any> {
  // Check system modules first
  const systemModule = SYSTEM_MODULES.find((m) => m.slug === slug);
  if (systemModule) {
    return {
      slug: systemModule.slug,
      name: systemModule.name,
      description: systemModule.description,
      content: systemModule.content,
      source: "system",
    };
  }

  // Check user skills
  const userSkills = await getUserSkillCards();
  const userSkill = userSkills.skills.find((s) => s.slug === slug);
  if (!userSkill) {
    return { error: "not_found" as const };
  }

  if ((userSkill as any).enabled === false) {
    return { error: "not_enabled" as const };
  }

  return {
    slug: userSkill.slug,
    name: userSkill.name,
    description: userSkill.description,
    content: userSkill.content,
    source: userSkill.source,
  };
}

export async function resolveWorkspaceAwareSkillsBySlugs(
  workspaceDir: string | null | undefined,
  slugs: string[]
): Promise<
  | { ok: true; skills: ResolvedSkill[] }
  | { ok: false; error: "not_found"; slug: string }
> {
  const uniqueSlugs = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (uniqueSlugs.length === 0) {
    return { ok: true, skills: [] };
  }

  try {
    const result = await resolveSkillReferencesBySlugs(workspaceDir, uniqueSlugs);
    return { ok: true, skills: result.skills };
  } catch (error) {
    if (error instanceof Error) {
      const matchedSlug = uniqueSlugs.find((slug) => error.message.includes(slug));
      return { ok: false, error: "not_found", slug: matchedSlug ?? uniqueSlugs[0] ?? "" };
    }
    return { ok: false, error: "not_found", slug: uniqueSlugs[0] ?? "" };
  }
}
