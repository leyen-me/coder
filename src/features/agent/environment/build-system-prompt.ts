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
    ...buildActiveSystemSkillsSection(environment.enabledSystemSkills),
    ...buildUserSkillsSection(),
    ...buildProjectInstructionsSection(environment.agentsMd),
  ].join("\n");
}

function buildActiveSystemSkillsSection(
  skills: AgentEnvironment["enabledSystemSkills"]
): string[] {
  if (!skills.length) {
    return [];
  }

  const lines = [
    "## Active skills (system)",
    "Follow these enabled system skills when they do not conflict with the user's current message.",
  ];

  for (const skill of skills) {
    lines.push("---", `[${skill.slug}] ${skill.name}`, skill.content.trim());
  }

  lines.push("");
  return lines;
}

function buildUserSkillsSection(): string[] {
  return [
    "## User skills",
    "User-defined skills must be enabled by the user before they become available.",
    "They are NOT included in this prompt by default.",
    "- Call list_skills to browse enabled skills (slug, name, description).",
    "- Call read_skill with a slug to load full instructions before following them.",
    "- Call create_skill to persist new custom skills when the user wants reusable instructions.",
    "- Call update_skill to modify an existing user skill (name, description, or content).",
    "- New skills are disabled until the user enables them on the Skills page.",
    "- The user may also reference an enabled skill via /slug in their message.",
    "",
  ];
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
    enabledSystemSkills: input.enabledSystemSkills ?? [],
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
