import type { SystemSkillDefinition } from "../../types";

type SystemSkillInput = Omit<SystemSkillDefinition, "category"> & {
  category: NonNullable<SystemSkillDefinition["category"]>;
};

export function createSystemSkill(
  input: SystemSkillInput
): SystemSkillDefinition {
  return input;
}
