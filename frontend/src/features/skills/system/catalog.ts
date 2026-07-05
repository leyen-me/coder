import type { SystemSkillDefinition } from "../types";
import { CORE_SYSTEM_SKILLS } from "./skills/core";
import { DEVELOPMENT_SYSTEM_SKILLS } from "./skills/development";
import { REVIEW_SYSTEM_SKILLS } from "./skills/review";
import { WORKFLOW_SYSTEM_SKILLS } from "./skills/workflow";

export const SYSTEM_SKILLS: SystemSkillDefinition[] = [
  ...CORE_SYSTEM_SKILLS,
  ...DEVELOPMENT_SYSTEM_SKILLS,
  ...WORKFLOW_SYSTEM_SKILLS,
  ...REVIEW_SYSTEM_SKILLS,
];
