/**
 * CLI Environment Resolver
 *
 * Resolves the runtime environment for the agent system prompt.
 * Aligned with the desktop version in src/features/agent/environment/.
 */

import { platform, release } from "node:os";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SYSTEM_SKILLS } from "@/features/skills/system/registry";
import type { AgentMode } from "../types";

export type AgentEnvironment = {
  workspaceDir: string | null;
  os: string;
  shell: string;
  isGitRepository: boolean;
  today: string;
  agentsMd: { path: string; content: string; truncated: boolean } | null;
  enabledSystemSkills: Array<{ slug: string; name: string; content: string }>;
};

export function resolveAgentEnvironment(
  workspaceDir: string | null
): AgentEnvironment {
  const os = `${platform()} (${release()})`;
  const shell = resolveShell();
  const isGitRepository = workspaceDir
    ? checkIsGitRepository(workspaceDir)
    : false;
  const today = formatToday(new Date());

  let agentsMd: {
    path: string;
    content: string;
    truncated: boolean;
  } | null = null;

  if (workspaceDir) {
    const agentsMdPath = resolve(workspaceDir, "AGENTS.md");
    if (existsSync(agentsMdPath)) {
      const content = readFileSync(agentsMdPath, "utf-8");
      agentsMd = {
        path: agentsMdPath,
        content:
          content.length > 32_000
            ? content.slice(0, 32_000) + "\n... [truncated]"
            : content,
        truncated: content.length > 32_000,
      };
    }
  }

  // System skills: use defaultEnabled since CLI has no database for preferences
  const enabledSystemSkills = SYSTEM_SKILLS.filter(
    (skill) => skill.defaultEnabled
  ).map((skill) => ({
    slug: skill.slug,
    name: skill.name,
    content: skill.content,
  }));

  return {
    workspaceDir,
    os,
    shell,
    isGitRepository,
    today,
    agentsMd,
    enabledSystemSkills,
  };
}

export function buildSystemPrompt(
  env: AgentEnvironment,
  agentMode?: AgentMode
): string {
  const workspaceLine = env.workspaceDir ?? "not selected";
  const gitLine = env.isGitRepository
    ? "yes"
    : env.workspaceDir
      ? "no"
      : "unknown";

  const modeLine = buildModeLine(agentMode);
  const modeGuidance = buildModeGuidance(agentMode, env.workspaceDir);

  const allBlocks: string[] = [];

  // Block 1: Identity + Environment
  allBlocks.push(
    [
      "You are Coder, a helpful terminal AI assistant.",
      "",
      "## Environment",
      "",
      `- workspaceDir: ${workspaceLine}`,
      `- os: ${env.os}`,
      `- shell: ${env.shell}`,
      `- gitRepository: ${gitLine}`,
      `- date: ${env.today}`,
      `- mode: ${modeLine}`,
    ].join("\n")
  );

  // Block 2: Communication Rules
  allBlocks.push(
    [
      "## Communication Rules",
      "",
      "1. Reply in the same language the user uses. Be concise, accurate, and friendly.",
      '2. Do not act unless the user has clearly asked you to. Answering questions, explaining, and analyzing do not require action — stop before reaching for tools.',
    ].join("\n")
  );

  // Blocks 3+: System Skills (one block per skill)
  for (const skill of env.enabledSystemSkills) {
    allBlocks.push(
      `## ${skill.name}\n\n${stripLeadingMarkdownH1(skill.content)}`
    );
  }

  // Block: Project Instructions (AGENTS.md)
  if (env.agentsMd?.content.trim()) {
    allBlocks.push(buildProjectInstructionsSection(env.agentsMd));
  }

  // Block: Mode Guidance (ask/plan only)
  if (modeGuidance.length > 0) {
    allBlocks.push(modeGuidance.join("\n"));
  }

  return allBlocks.join("\n\n---\n\n");
}

function buildModeLine(agentMode?: AgentMode): string {
  switch (agentMode) {
    case "ask":
      return "ask (read-only: can read files, search code, browse the web, and list skills — cannot modify files or run shell commands)";
    default:
      return "agent (full tool access)";
  }
}

function buildModeGuidance(
  agentMode: AgentMode | undefined,
  _workspaceDir: string | null
): string[] {
  if (agentMode === "ask") {
    return buildAskModeGuidance();
  }
  return [];
}

function buildAskModeGuidance(): string[] {
  return [
    "## Mode Guidance",
    "",
    "You are in Ask mode — you can only read files, search, and browse.",
    "When the user asks you to modify files, run commands, or perform any write operation:",
    '  - Explain that the task requires write access.',
    '  - Tell the user they can switch to Agent mode by using `coder run` instead of `coder ask` to give you full tool access.',
    "Do NOT silently refuse or just say \"I can't do that.\" Always provide a clear path forward.",
  ];
}

function buildProjectInstructionsSection(
  agentsMd: NonNullable<AgentEnvironment["agentsMd"]>
): string {
  const lines = [
    "## Project instructions (AGENTS.md)",
    "",
    "Follow these project-specific rules when they do not conflict with the user's current message.",
    agentsMd.content.trimEnd(),
  ];

  if (agentsMd.truncated) {
    lines.push(
      "",
      `Note: ${agentsMd.path} was truncated to 32 KB. Use read_file on ${agentsMd.path} to read the full file if needed.`
    );
  }

  return lines.join("\n");
}

function stripLeadingMarkdownH1(content: string): string {
  return content.replace(/^#\s+[^\n]+\n+/, "").trim();
}

function formatToday(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    timeZoneName: "longOffset",
  }).format(date);
}

function resolveShell(): string {
  const p = platform();
  if (p === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/sh";
}

function checkIsGitRepository(dir: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: dir,
      stdio: "pipe",
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}
