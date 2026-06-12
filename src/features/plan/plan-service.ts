import { invoke, isTauri } from "@tauri-apps/api/core";

import { PLAN_DIRECTORY } from "./constants";

export type PlanListEntry = {
  name: string;
  path: string;
  modifiedAt: number;
  bytes: number;
};

export type PlanReadResult = {
  path: string;
  name: string;
  content: string;
  sha256: string;
  modifiedAt: number;
};

export async function listWorkspacePlans(
  workspaceDir: string
): Promise<PlanListEntry[]> {
  if (!isTauri()) {
    return [];
  }

  const result = await invoke<{ plans: PlanListEntry[] }>("tool_plan_list", {
    workspaceDir,
  });
  return result.plans;
}

export async function readWorkspacePlan(
  workspaceDir: string,
  name: string
): Promise<PlanReadResult> {
  return invoke<PlanReadResult>("tool_plan_read", {
    workspaceDir,
    name,
  });
}

export async function getLatestWorkspacePlan(
  workspaceDir: string
): Promise<(PlanListEntry & { content?: string }) | null> {
  const plans = await listWorkspacePlans(workspaceDir);
  const latest = plans[0];
  if (!latest) {
    return null;
  }

  try {
    const read = await readWorkspacePlan(workspaceDir, latest.name);
    return {
      ...latest,
      content: read.content,
    };
  } catch {
    return latest;
  }
}

export function formatPlanTabLabel(name: string): string {
  return name.endsWith("-plan.md")
    ? name.slice(0, -"-plan.md".length)
    : name;
}

export function isPlanPath(path: string): boolean {
  return path.startsWith(`${PLAN_DIRECTORY}/`) && path.endsWith("-plan.md");
}
