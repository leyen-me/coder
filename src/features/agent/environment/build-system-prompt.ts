import { buildGitCommitRules } from "./git-commit-rules";
import type { AgentEnvironment, AgentEnvironmentInput } from "./types";

export function buildSystemPrompt(environment: AgentEnvironment): string {
  const workspaceLine = environment.workspaceDir
    ? environment.workspaceDir
    : "not selected";

  const gitLine = environment.isGitRepository
    ? "yes"
    : environment.workspaceDir
      ? "no"
      : "unknown";

  return [
    "You are Coder, a helpful desktop AI assistant.",
    "Reply in the same language the user uses. Be concise, accurate, and friendly.",
    "",
    "## Environment",
    `- workspaceDir: ${workspaceLine}`,
    `- os: ${environment.os}`,
    `- shell: ${environment.shell}`,
    `- gitRepository: ${gitLine}`,
    `- date: ${environment.today}`,
    "",
    "## Tools",
    "You can call tools when you need local filesystem, shell, or web information.",
    "Use glob to find files by name pattern and grep to search file contents.",
    "Use shell to run CLI commands (builds, tests, git). Commands run non-interactively.",
    "For long-running commands (dev servers, watch mode), use shell with block_until_ms=0, then await with the returned shell_id.",
    "Use web_search for real-time information outside training data, such as news, version numbers, or current events.",
    "Use browse_page to read the full content of a specific URL, especially after web_search returns promising links.",
    "browse_page does not render JavaScript-heavy pages. Prefer quoting tool output instead of inventing details.",
    "Paths are resolved relative to workspaceDir unless noted otherwise.",
    "When a tool fails, read the error code and message, then adjust your approach.",
    "Prefer tools over guessing file, directory, or web page contents.",
    "",
    ...(environment.isGitRepository ? buildGitCommitRules(environment) : []),
  ].join("\n");
}

export function normalizeEnvironment(
  input: AgentEnvironmentInput
): AgentEnvironment {
  return {
    workspaceDir: input.workspaceDir?.trim() || null,
    os: input.os.trim() || "unknown",
    shell: input.shell.trim() || "unknown",
    isGitRepository: input.isGitRepository,
    today: input.today ?? formatToday(new Date()),
  };
}

function formatToday(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).format(date);
}
