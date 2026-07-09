import type { SystemModuleDefinition } from "../types";
import { CORE_SYSTEM_MODULES } from "./skills/core";
import { DEVELOPMENT_SYSTEM_MODULES } from "./skills/development";
import { REVIEW_SYSTEM_MODULES } from "./skills/review";
import { WORKFLOW_SYSTEM_MODULES } from "./skills/workflow";

export const SYSTEM_MODULES: SystemModuleDefinition[] = [
  ...CORE_SYSTEM_MODULES,
  ...DEVELOPMENT_SYSTEM_MODULES,
  ...WORKFLOW_SYSTEM_MODULES,
  ...REVIEW_SYSTEM_MODULES,
];
