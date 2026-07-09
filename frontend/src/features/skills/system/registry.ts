import type { SystemModuleDefinition } from "../types";
import { SYSTEM_MODULES } from "./catalog";

export { SYSTEM_MODULES };

const slugSet = new Set<string>();

for (const module of SYSTEM_MODULES) {
  if (slugSet.has(module.slug)) {
    throw new Error(`Duplicate system module slug: ${module.slug}`);
  }
  slugSet.add(module.slug);
}

export function getSystemModuleBySlug(
  slug: string
): SystemModuleDefinition | null {
  return SYSTEM_MODULES.find((module) => module.slug === slug) ?? null;
}

export function getSystemModuleById(id: string): SystemModuleDefinition | null {
  return SYSTEM_MODULES.find((module) => module.id === id) ?? null;
}

export function getAllSystemModuleSlugs(): Set<string> {
  return new Set(SYSTEM_MODULES.map((module) => module.slug));
}
