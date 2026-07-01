/**
 * CLI Environment Resolver
 * Resolves the runtime environment for the agent system prompt.
 */

import { platform, release, hostname, EOL } from "node:os";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type AgentEnvironment = {
  workspaceDir: string | null;
  os: string;
  shell: string;
  isGitRepository: boolean;
  today: string;
  agentsMd: { path: string; content: string; truncated: boolean } | null;
  enabledSystemSkills: Array<{ slug: string; name: string; content: string }>;
};

export function resolveAgentEnvironment(workspaceDir: string | null): AgentEnvironment {
  const os = `${platform()} (${release()})`;
  const shell = resolveShell();
  const isGitRepository = workspaceDir ? checkIsGitRepository(workspaceDir) : false;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  let agentsMd: { path: string; content: string; truncated: boolean } | null = null;

  if (workspaceDir) {
    const agentsMdPath = resolve(workspaceDir, "AGENTS.md");
    if (existsSync(agentsMdPath)) {
      const content = readFileSync(agentsMdPath, "utf-8");
      agentsMd = {
        path: agentsMdPath,
        content: content.length > 4000 ? content.slice(0, 4000) + "\n... [truncated]" : content,
        truncated: content.length > 4000,
      };
    }
  }

  return {
    workspaceDir,
    os,
    shell,
    isGitRepository,
    today,
    agentsMd,
    enabledSystemSkills: [],
  };
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

export function buildSystemPrompt(env: AgentEnvironment): string {
  const workspaceLine = env.workspaceDir ?? "not selected";
  const gitLine = env.isGitRepository ? "yes" : env.workspaceDir ? "no" : "unknown";

  const lines = [
    "You are Coder, a helpful terminal AI assistant.",
    "",
    "## Environment",
    `- Workspace: ${workspaceLine}`,
    `- OS: ${env.os}`,
    `- Shell: ${env.shell}`,
    `- Git repository: ${gitLine}`,
    `- Date: ${env.today}`,
    "",
    "## Available Tools",
    "You have access to all standard tools: file operations, shell commands, web search, skills, and more.",
    "",
    "## Guidelines",
    "- Always read files before editing them.",
    "- Prefer targeted edits over full file replacements.",
    "- Use shell commands only for builds, tests, git, and non-interactive CLI tasks.",
    "- When a task requires multiple steps, create a plan first using todo_write.",
    "- After completing a task, summarize what was done.",
    "- Use ask_question when you need clarification from the user.",
    "",
  ];

  if (env.agentsMd) {
    lines.push("## Project Instructions (AGENTS.md)");
    lines.push("");
    lines.push(env.agentsMd.content);
    lines.push("");
  }

  return lines.join("\n");
}
