import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import { getConfigDirPath } from "../config";

// Skills storage directory
function getSkillsDir(): string {
  const dir = join(getConfigDirPath(), "skills");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getSkillFilePath(slug: string): string {
  const safeSlug = slug.replace(/[^a-z0-9-]/g, "").toLowerCase();
  return join(getSkillsDir(), `${safeSlug}.json`);
}

type SkillRecord = {
  slug: string;
  name: string;
  description: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

function readSkill(slug: string): SkillRecord | null {
  const filePath = getSkillFilePath(slug);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeSkill(slug: string, skill: Omit<SkillRecord, "createdAt" | "updatedAt">): void {
  const existing = readSkill(slug);
  const record: SkillRecord = {
    ...skill,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  writeFileSync(getSkillFilePath(slug), JSON.stringify(record, null, 2), "utf-8");
}

function listAllSkills(): SkillRecord[] {
  const dir = getSkillsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf-8")) as SkillRecord;
      } catch {
        return null;
      }
    })
    .filter((s): s is SkillRecord => s !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Handlers
type ListSkillsArgs = Record<string, never>;

export const listSkillsHandler: ToolHandler = async (_rawArgs, _context) => {
  const skills = listAllSkills();
  return toolSuccess("list_skills", {
    skills: skills.map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
    })),
    total: skills.length,
  });
};

type ReadSkillArgs = { slug: string };

export const readSkillHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as ReadSkillArgs;
  if (!args.slug?.trim()) {
    return toolFailure("read_skill", "invalid_arguments", "slug is required");
  }

  const skill = readSkill(args.slug.trim());
  if (!skill) {
    return toolFailure("read_skill", "not_found", `Skill not found: ${args.slug}`);
  }

  return toolSuccess("read_skill", skill);
};

type CreateSkillArgs = {
  slug: string;
  name: string;
  description: string;
  content: string;
};

export const createSkillHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as CreateSkillArgs;
  if (!args.slug?.trim() || !args.name?.trim() || !args.content?.trim()) {
    return toolFailure("create_skill", "invalid_arguments", "slug, name, and content are required");
  }

  const slug = args.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (readSkill(slug)) {
    return toolFailure("create_skill", "exists", `Skill already exists: ${slug}. Use update_skill to modify it.`);
  }

  writeSkill(slug, {
    slug,
    name: args.name.trim(),
    description: args.description?.trim() ?? "",
    content: args.content.trim(),
  });

  return toolSuccess("create_skill", { slug, name: args.name.trim() });
};

type UpdateSkillArgs = {
  slug: string;
  name?: string;
  description?: string;
  content?: string;
};

export const updateSkillHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as UpdateSkillArgs;
  if (!args.slug?.trim()) {
    return toolFailure("update_skill", "invalid_arguments", "slug is required");
  }

  const slug = args.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const existing = readSkill(slug);
  if (!existing) {
    return toolFailure("update_skill", "not_found", `Skill not found: ${slug}`);
  }

  writeSkill(slug, {
    slug,
    name: args.name?.trim() ?? existing.name,
    description: args.description?.trim() ?? existing.description,
    content: args.content?.trim() ?? existing.content,
  });

  return toolSuccess("update_skill", { slug, name: args.name?.trim() ?? existing.name });
};
