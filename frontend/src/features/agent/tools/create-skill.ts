import { assertUserSkillSlugAvailable } from "@/features/skills/lib/resolve-skills";
import { createUserSkill, isValidSkillSlug } from "@/lib/db/skills";

import { CREATE_SKILL_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type CreateSkillArgs = {
  slug: string;
  name: string;
  description: string;
  content: string;
};

export const createSkillHandler: ToolHandler = async (rawArgs) => {
  const args = parseCreateSkillArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(CREATE_SKILL_TOOL_NAME, "invalid_arguments", args.message);
  }

  const { slug, name, description, content } = args.value;

  if (!isValidSkillSlug(slug)) {
    return toolFailure(
      CREATE_SKILL_TOOL_NAME,
      "invalid_slug",
      "Slug must use lowercase letters, numbers, and hyphens (e.g. my-skill)."
    );
  }

  try {
    assertUserSkillSlugAvailable(slug);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Slug conflicts with a system skill";
    return toolFailure(CREATE_SKILL_TOOL_NAME, "slug_conflict", message);
  }

  try {
    const record = await createUserSkill({ slug, name, description, content });
    return toolSuccess(CREATE_SKILL_TOOL_NAME, {
      id: record.id,
      slug: record.slug,
      name: record.name,
      description: record.description,
      enabled: record.enabled,
      hint: "Skill was created disabled. Ask the user to enable it on the Skills page before using /slug or read_skill.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "Skill slug already exists") {
      return toolFailure(CREATE_SKILL_TOOL_NAME, "slug_exists", message);
    }

    if (message === "Invalid skill slug") {
      return toolFailure(
        CREATE_SKILL_TOOL_NAME,
        "invalid_slug",
        "Slug must use lowercase letters, numbers, and hyphens (e.g. my-skill)."
      );
    }

    return toolFailure(CREATE_SKILL_TOOL_NAME, "execution_failed", message);
  }
};

function parseCreateSkillArgs(
  rawArgs: unknown
):
  | { ok: true; value: CreateSkillArgs }
  | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be an object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const slug = record.slug;
  const name = record.name;
  const description = record.description;
  const content = record.content;

  if (typeof slug !== "string" || !slug.trim()) {
    return { ok: false, message: "slug is required" };
  }

  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, message: "name is required" };
  }

  if (typeof description !== "string" || !description.trim()) {
    return { ok: false, message: "description is required" };
  }

  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, message: "content is required" };
  }

  return {
    ok: true,
    value: {
      slug: slug.trim(),
      name: name.trim(),
      description: description.trim(),
      content,
    },
  };
}
