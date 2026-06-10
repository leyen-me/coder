import { buildGitCommitRules } from "./git-commit-rules";
import type {
  AgentEnvironment,
  AgentEnvironmentInput,
  AgentProjectInstructions,
} from "./types";

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
    ...buildProjectInstructionsSection(environment.agentsMd),
    ...(environment.isGitRepository ? buildGitCommitRules(environment) : []),
  ].join("\n");
}

function buildProjectInstructionsSection(
  agentsMd: AgentProjectInstructions
): string[] {
  if (!agentsMd?.content.trim()) {
    return [];
  }

  const lines = [
    "## Project instructions (AGENTS.md)",
    "Follow these project-specific rules when they do not conflict with the user's current message.",
    agentsMd.content.trimEnd(),
  ];

  if (agentsMd.truncated) {
    lines.push(
      "",
      `Note: ${agentsMd.path} was truncated to 32 KB. Use read_file on ${agentsMd.path} to read the full file if needed.`
    );
  }

  lines.push("");
  return lines;
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
    agentsMd: input.agentsMd ?? null,
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
