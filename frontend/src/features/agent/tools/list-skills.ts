import { listEnabledSkillsForTools } from "@/features/skills/lib/resolve-skills";

import { LIST_SKILLS_TOOL_NAME } from "./definitions";
import { toolSuccess } from "./result";
import type { ToolHandler } from "./types";

export const listSkillsHandler: ToolHandler = async () => {
  const skills = await listEnabledSkillsForTools();
  return toolSuccess(LIST_SKILLS_TOOL_NAME, { skills });
};
