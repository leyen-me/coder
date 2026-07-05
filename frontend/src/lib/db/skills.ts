import {
  SYSTEM_SKILL_PREFERENCES_STORE,
  USER_SKILLS_STORE,
} from "./constants";
import { getDb } from "./client";
import { notifyDbChange } from "./subscriptions";
import type { SystemSkillPreference, UserSkillRecord } from "./types";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSkillSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export async function listUserSkills(): Promise<UserSkillRecord[]> {
  const db = await getDb();
  const skills = await db.getAll<UserSkillRecord>(USER_SKILLS_STORE);
  return skills.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getUserSkillById(
  id: string
): Promise<UserSkillRecord | null> {
  const db = await getDb();
  return (await db.get<UserSkillRecord>(USER_SKILLS_STORE, id)) ?? null;
}

export async function getUserSkillBySlug(
  slug: string
): Promise<UserSkillRecord | null> {
  const db = await getDb();
  const skills = await db.getAll<UserSkillRecord>(USER_SKILLS_STORE);
  return skills.find((skill) => skill.slug === slug) ?? null;
}

export type CreateUserSkillInput = {
  slug: string;
  name: string;
  description: string;
  content: string;
};

export async function createUserSkill(
  input: CreateUserSkillInput
): Promise<UserSkillRecord> {
  const slug = input.slug.trim();
  if (!isValidSkillSlug(slug)) {
    throw new Error("Invalid skill slug");
  }

  const existing = await getUserSkillBySlug(slug);
  if (existing) {
    throw new Error("Skill slug already exists");
  }

  const now = Date.now();
  const record: UserSkillRecord = {
    id: crypto.randomUUID(),
    slug,
    name: input.name.trim(),
    description: input.description.trim(),
    content: input.content,
    enabled: false,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDb();
  await db.put(USER_SKILLS_STORE, record);
  notifyDbChange();
  return record;
}

export type UpdateUserSkillInput = Partial<
  Pick<UserSkillRecord, "slug" | "name" | "description" | "content" | "enabled">
>;

export async function updateUserSkill(
  id: string,
  patch: UpdateUserSkillInput
): Promise<UserSkillRecord | null> {
  const db = await getDb();
  const existing = await db.get<UserSkillRecord>(USER_SKILLS_STORE, id);
  if (!existing) {
    return null;
  }

  if (patch.slug !== undefined) {
    const slug = patch.slug.trim();
    if (!isValidSkillSlug(slug)) {
      throw new Error("Invalid skill slug");
    }
    if (slug !== existing.slug) {
      const conflict = await getUserSkillBySlug(slug);
      if (conflict && conflict.id !== id) {
        throw new Error("Skill slug already exists");
      }
    }
  }

  const next: UserSkillRecord = {
    ...existing,
    ...patch,
    slug: patch.slug?.trim() ?? existing.slug,
    name: patch.name?.trim() ?? existing.name,
    description: patch.description?.trim() ?? existing.description,
    updatedAt: Date.now(),
  };

  await db.put(USER_SKILLS_STORE, next);
  notifyDbChange();
  return next;
}

export async function deleteUserSkill(id: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.get<UserSkillRecord>(USER_SKILLS_STORE, id);
  if (!existing) {
    return false;
  }

  await db.delete(USER_SKILLS_STORE, id);
  notifyDbChange();
  return true;
}

export async function listSystemSkillPreferences(): Promise<
  SystemSkillPreference[]
> {
  const db = await getDb();
  return db.getAll<SystemSkillPreference>(SYSTEM_SKILL_PREFERENCES_STORE);
}

export async function getSystemSkillPreference(
  skillId: string
): Promise<SystemSkillPreference | null> {
  const db = await getDb();
  return (await db.get<SystemSkillPreference>(SYSTEM_SKILL_PREFERENCES_STORE, skillId)) ?? null;
}

export async function setSystemSkillEnabled(
  skillId: string,
  enabled: boolean
): Promise<SystemSkillPreference> {
  const record: SystemSkillPreference = {
    skillId,
    enabled,
    updatedAt: Date.now(),
  };

  const db = await getDb();
  await db.put(SYSTEM_SKILL_PREFERENCES_STORE, record);
  notifyDbChange();
  return record;
}
