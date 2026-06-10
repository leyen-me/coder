import type { UserSkillRecord } from "@/lib/db";

export type EditableUserSkill = Pick<
  UserSkillRecord,
  "id" | "slug" | "name" | "description" | "content"
>;
