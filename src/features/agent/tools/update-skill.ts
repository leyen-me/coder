import { getUserSkillBySlug, updateUserSkill } from "@/lib/db/skills";
import { assertUserSkillSlugAvailable } from "@/features/skills/lib/resolve-skills";

import { UPDATE_SKILL_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type UpdateSkillArgs = {
  slug: string;
  name?: string;
  description?: string;
  content?: string;
};

export const updateSkillHandler: ToolHandler = async (rawArgs) => {
  const args = parseUpdateSkillArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(UPDATE_SKILL_TOOL_NAME, "invalid_arguments", args.message);
  }

  const { slug, name, description, content } = args.value;

  // Look up the skill by slug to get its internal ID
  const existing = await getUserSkillBySlug(slug);
  if (!existing) {
    return toolFailure(
      UPDATE_SKILL_TOOL_NAME,
      "not_found",
      `No user skill found with slug "${slug}". Use create_skill to create a new skill.`
    );
  }

  // Validate the slug is not conflicting with a system skill
  // (only when the slug itself is being provided; we use slug as identifier)
  try {
    assertUserSkillSlugAvailable(slug, existing.slug);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Slug conflicts with a system skill";
    return toolFailure(UPDATE_SKILL_TOOL_NAME, "slug_conflict", message);
  }

  try {
    const record = await updateUserSkill(existing.id, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(content !== undefined && { content }),
    });

    if (!record) {
      return toolFailure(
        UPDATE_SKILL_TOOL_NAME,
        "not_found",
        `Skill "${slug}" was removed before the update could complete.`
      );
    }

    return toolSuccess(UPDATE_SKILL_TOOL_NAME, {
      id: record.id,
      slug: record.slug,
      name: record.name,
      description: record.description,
      enabled: record.enabled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "Skill slug already exists") {
      return toolFailure(UPDATE_SKILL_TOOL_NAME, "slug_exists", message);
    }

    if (message === "Invalid skill slug") {
      return toolFailure(
        UPDATE_SKILL_TOOL_NAME,
        "invalid_slug",
        "Slug must use lowercase letters, numbers, and hyphens (e.g. my-skill)."
      );
    }

    return toolFailure(UPDATE_SKILL_TOOL_NAME, "execution_failed", message);
  }
};

function parseUpdateSkillArgs(
  rawArgs: unknown
):
  | { ok: true; value: UpdateSkillArgs }
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

  // At least one field to update must be provided
  if (name === undefined && description === undefined && content === undefined) {
    return {
      ok: false,
      message:
        "At least one of name, description, or content must be provided to update.",
    };
  }

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return { ok: false, message: "name must be a non-empty string if provided" };
  }

  if (description !== undefined && (typeof description !== "string" || !description.trim())) {
    return {
      ok: false,
      message: "description must be a non-empty string if provided",
    };
  }

  if (content !== undefined && (typeof content !== "string" || !content.trim())) {
    return { ok: false, message: "content must be a non-empty string if provided" };
  }

  return {
    ok: true,
    value: {
      slug: slug.trim(),
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(content !== undefined && { content }),
    },
  };
}
