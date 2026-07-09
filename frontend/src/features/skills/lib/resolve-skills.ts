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
