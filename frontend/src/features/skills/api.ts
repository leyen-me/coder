import JSZip from "jszip";

import { apiPost } from "@/lib/api/client";

import type {
  AvailableSkill,
  ResolvedSkill,
  SkillRoots,
  SkillSource,
  UserSkillCardViewModel,
} from "./types";

type SkillsCatalogResponse = {
  roots: SkillRoots;
  skills: AvailableSkill[];
};

type UserSkillsResponse = {
  rootPath: string;
  skills: ResolvedSkill[];
};

type ResolveSkillsResponse = {
  skills: ResolvedSkill[];
};

type ImportSkillResponse = {
  skill: ResolvedSkill;
};

type DeleteSkillResponse = {
  deleted: boolean;
};

export async function listAvailableSkills(
  workspaceDir: string | null | undefined
): Promise<SkillsCatalogResponse> {
  return apiPost<SkillsCatalogResponse>("/api/skills/catalog", {
    workspaceDir: workspaceDir?.trim() || undefined,
  });
}

/**
 * Mirrors the backend ordering: built-in → user → workspace, then slug (asc).
 * Keeps the composer catalog and the /skills page visually consistent.
 */
const SOURCE_RANK: Record<SkillSource, number> = {
  builtin: 0,
  user: 1,
  workspace: 2,
};

export async function listUserSkills(): Promise<{
  rootPath: string;
  skills: UserSkillCardViewModel[];
}> {
  const response = await apiPost<UserSkillsResponse>("/api/skills/user_list", {});
  return {
    rootPath: response.rootPath,
    skills: response.skills
      .map((skill) => ({
        ...skill,
        estimatedTokens: Math.ceil(skill.content.length / 4),
      }))
      .sort(
        (left, right) =>
          SOURCE_RANK[left.source] - SOURCE_RANK[right.source] ||
          left.slug.localeCompare(right.slug)
      ),
  };
}

export async function resolveSkillReferencesBySlugs(
  workspaceDir: string | null | undefined,
  slugs: string[]
): Promise<ResolveSkillsResponse> {
  return apiPost<ResolveSkillsResponse>("/api/skills/resolve_references", {
    workspaceDir: workspaceDir?.trim() || undefined,
    slugs,
  });
}

export async function importUserSkillZip(file: File): Promise<ResolvedSkill> {
  const archive = await JSZip.loadAsync(file);
  const files = await Promise.all(
    Object.values(archive.files)
      .filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX/"))
      .map(async (entry) => ({
        path: entry.name,
        dataBase64: await entry.async("base64"),
      }))
  );

  const response = await apiPost<ImportSkillResponse>("/api/skills/import", { files });
  return response.skill;
}

export async function deleteUserSkillBySlug(slug: string): Promise<DeleteSkillResponse> {
  return apiPost<DeleteSkillResponse>("/api/skills/delete", { slug });
}
