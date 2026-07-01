import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import { getConfigDirPath } from "../config";

// Plan storage — directory of .plan files
function getPlansDir(): string {
  const dir = join(getConfigDirPath(), "plans");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

type PlanRecord = {
  name: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

function getPlanFilePath(name: string): string {
  const safeName = name.replace(/[^a-z0-9-_.]/gi, "").toLowerCase();
  return join(getPlansDir(), `${safeName}.json`);
}

function readPlanFile(name: string): PlanRecord | null {
  const filePath = getPlanFilePath(name);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writePlanFile(name: string, plan: PlanRecord): void {
  writeFileSync(getPlanFilePath(name), JSON.stringify(plan, null, 2), "utf-8");
}

function deletePlanFile(name: string): boolean {
  const filePath = getPlanFilePath(name);
  if (!existsSync(filePath)) return false;
  try {
    writeFileSync(filePath, JSON.stringify({ deleted: true }), "utf-8");
    return true;
  } catch {
    return false;
  }
}

function listPlanFiles(): string[] {
  return readdirSync(getPlansDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

// Handlers
type PlanCreateArgs = { name: string; title?: string; content: string };

export const planCreateHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as PlanCreateArgs;
  if (!args.name?.trim() || !args.content?.trim()) {
    return toolFailure("plan_create", "invalid_arguments", "name and content are required");
  }

  const name = args.name.trim().toLowerCase().replace(/[^a-z0-9-_.]/gi, "");
  if (readPlanFile(name)) {
    return toolFailure("plan_create", "exists", `Plan already exists: ${name}`);
  }

  writePlanFile(name, {
    name,
    title: args.title?.trim() ?? name,
    content: args.content.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return toolSuccess("plan_create", { name, title: args.title?.trim() ?? name });
};

type PlanReadArgs = { name: string };

export const planReadHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as PlanReadArgs;
  if (!args.name?.trim()) {
    return toolFailure("plan_read", "invalid_arguments", "name is required");
  }

  const plan = readPlanFile(args.name.trim());
  if (!plan) {
    return toolFailure("plan_read", "not_found", `Plan not found: ${args.name}`);
  }

  return toolSuccess("plan_read", plan);
};

type PlanUpdateArgs = { name: string; title?: string; content?: string };

export const planUpdateHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as PlanUpdateArgs;
  if (!args.name?.trim()) {
    return toolFailure("plan_update", "invalid_arguments", "name is required");
  }

  const existing = readPlanFile(args.name.trim());
  if (!existing) {
    return toolFailure("plan_update", "not_found", `Plan not found: ${args.name}`);
  }

  writePlanFile(args.name.trim(), {
    ...existing,
    title: args.title?.trim() ?? existing.title,
    content: args.content?.trim() ?? existing.content,
    updatedAt: Date.now(),
  });

  return toolSuccess("plan_update", { name: args.name.trim() });
};

type PlanEditArgs = { name: string; instructions: string };

export const planEditHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as PlanEditArgs;
  if (!args.name?.trim()) {
    return toolFailure("plan_edit", "invalid_arguments", "name is required");
  }

  const existing = readPlanFile(args.name.trim());
  if (!existing) {
    return toolFailure("plan_edit", "not_found", `Plan not found: ${args.name}`);
  }

  // Append instructions to plan content
  writePlanFile(args.name.trim(), {
    ...existing,
    content: existing.content + "\n\n## Edit Instructions\n\n" + (args.instructions?.trim() ?? ""),
    updatedAt: Date.now(),
  });

  return toolSuccess("plan_edit", { name: args.name.trim() });
};

type PlanDeleteArgs = { name: string };

export const planDeleteHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as PlanDeleteArgs;
  if (!args.name?.trim()) {
    return toolFailure("plan_delete", "invalid_arguments", "name is required");
  }

  deletePlanFile(args.name.trim());
  return toolSuccess("plan_delete", { name: args.name.trim(), deleted: true });
};

type PlanListArgs = Record<string, never>;

export const planListHandler: ToolHandler = async (_rawArgs, _context) => {
  const names = listPlanFiles();
  const plans = names
    .map((name) => readPlanFile(name))
    .filter((p): p is PlanRecord => p !== null)
    .map((p) => ({ name: p.name, title: p.title }));

  return toolSuccess("plan_list", { plans, total: plans.length });
};
