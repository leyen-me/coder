import type { SystemModuleDefinition } from "../../types";

type SystemModuleInput = Omit<SystemModuleDefinition, "category"> & {
  category: NonNullable<SystemModuleDefinition["category"]>;
};

export function createSystemModule(
  input: SystemModuleInput
): SystemModuleDefinition {
  return input;
}
