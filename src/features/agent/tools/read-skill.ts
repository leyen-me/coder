import { readEnabledSkillBySlug } from "@/features/skills/lib/resolve-skills";

import { READ_SKILL_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type ReadSkillArgs = {
  slug: string;
};

export const readSkillHandler: ToolHandler = async (rawArgs) => {
  const args = parseReadSkillArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(READ_SKILL_TOOL_NAME, "invalid_arguments", args.message);
  }

  const result = await readEnabledSkillBySlug(args.value.slug);
  if ("error" in result) {
    return toolFailure(READ_SKILL_TOOL_NAME, result.error, describeSkillError(result.error));
  }

  return toolSuccess(READ_SKILL_TOOL_NAME, {
    slug: result.slug,
    name: result.name,
    description: result.description,
    content: result.content,
    source: result.source,
    alreadyInPrompt: result.alreadyInPrompt ?? false,
  });
};

function parseReadSkillArgs(
  rawArgs: unknown
):
  | { ok: true; value: ReadSkillArgs }
  | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null) {
    return { ok: false, message: "Arguments must be an object" };
  }

  const slug = (rawArgs as ReadSkillArgs).slug;
  if (typeof slug !== "string" || !slug.trim()) {
    return { ok: false, message: "slug is required" };
  }

  return { ok: true, value: { slug: slug.trim() } };
}

function describeSkillError(error: "not_found" | "not_enabled"): string {
  if (error === "not_found") {
    return "Skill not found";
  }

  return "Skill exists but is not enabled. Ask the user to enable it on the Skills page.";
}
