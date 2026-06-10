import { listEnabledSkillsForTools } from "@/features/skills/lib/resolve-skills";

import { LIST_SKILLS_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type ListSkillsArgs = {
  source?: "all" | "system" | "user";
};

export const listSkillsHandler: ToolHandler = async (rawArgs) => {
  const args = parseListSkillsArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(LIST_SKILLS_TOOL_NAME, "invalid_arguments", args.message);
  }

  const skills = await listEnabledSkillsForTools(args.value.source ?? "all");
  return toolSuccess(LIST_SKILLS_TOOL_NAME, { skills });
};

function parseListSkillsArgs(
  rawArgs: unknown
):
  | { ok: true; value: ListSkillsArgs }
  | { ok: false; message: string } {
  if (rawArgs === null || rawArgs === undefined) {
    return { ok: true, value: {} };
  }

  if (typeof rawArgs !== "object") {
    return { ok: false, message: "Arguments must be an object" };
  }

  const source = (rawArgs as ListSkillsArgs).source;
  if (
    source !== undefined &&
    source !== "all" &&
    source !== "system" &&
    source !== "user"
  ) {
    return {
      ok: false,
      message: 'source must be "all", "system", or "user"',
    };
  }

  return { ok: true, value: { source } };
}
