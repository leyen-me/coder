import type {
  AgentEnvironment,
  AgentEnvironmentInput,
  AgentProjectInstructions,
} from "./types";
import type { AgentMode } from "@/features/agent/types";

export function buildSystemPrompt(
  environment: AgentEnvironment,
  agentMode?: AgentMode
): string {
  const workspaceLine = environment.workspaceDir
    ? environment.workspaceDir
    : "not selected";

  const gitLine = environment.isGitRepository
    ? "yes"
    : environment.workspaceDir
      ? "no"
      : "unknown";

  const modeLine =
    agentMode === "ask"
      ? "ask (read-only: can read files, search code, browse the web, and list skills — cannot modify files or run shell commands)"
      : agentMode === "plan"
        ? "plan (planning: can read files, search, browse, manage .plan/ files and todos — cannot modify project files or run shell commands)"
        : "agent (full tool access)";

  const modeGuidance =
    agentMode === "ask"
      ? [
          "",
          "## Mode Guidance",
          "You are in Ask mode — you can only read files, search, and browse.",
          "When the user asks you to modify files, run commands, or perform any write operation:",
          "  - Explain that the task requires write access.",
          "  - Tell the user they can switch to Agent mode (click \"Agent\" next to the input) to give you full tool access.",
          "Do NOT silently refuse or just say \"I can't do that.\" Always provide a clear path forward.",
          "",
        ]
      : agentMode === "plan"
        ? [
            "",
            "## Mode Guidance",
            "You are in Plan mode — research, analyze, and write a structured Markdown plan to the .plan/ directory.",
            "Use plan_create to create a new plan file (e.g. refactor-auth-plan.md). Use plan_update to revise an existing plan. Use plan_list and plan_read to inspect existing plans.",
            "Plan filenames must be descriptive and end with -plan.md (lowercase letters, numbers, and hyphens only).",
            "Your assistant response should briefly summarize what you did (which plan file was created or updated). Do NOT paste the full plan in chat — the plan lives in the file.",
            "Do NOT include greetings, process narration, tool-call commentary, or closing questions.",
            "You may read files, search code, browse the web, and use todo_write to track planning steps.",
            "Do NOT modify project files, run shell commands, or implement changes in this mode.",
            "When the user asks you to implement, tell them to click \"Build with Agent\" to execute the plan.",
            "Do NOT silently attempt implementation. Always keep the user in the planning loop until they explicitly build.",
            "",
          ]
        : [];

  return [
    "You are Coder, a helpful desktop AI assistant.",
    "Reply in the same language the user uses. Be concise, accurate, and friendly.",
    "",
    "## Environment",
    `- workspaceDir: ${workspaceLine}`,
    `- os: ${environment.os}`,
    ...(environment.os.toLowerCase().startsWith("windows")
      ? [
          `- windows_unicode_filenames: When operating on files with non-ASCII characters (rename, delete, etc.), use PowerShell directly instead of CMD to avoid garbled characters caused by CMD code page issues.`,
        ]
      : []),
    `- shell: ${environment.shell}`,
    `- gitRepository: ${gitLine}`,
    `- date: ${environment.today}`,
    `- mode: ${modeLine}`,
    "",
    ...buildSystemPromptSections(environment.enabledSystemSkills),
    ...buildUserSkillsSection(),
    ...buildProjectInstructionsSection(environment.agentsMd),
    ...modeGuidance,
  ].join("\n");
}

function buildSystemPromptSections(
  skills: AgentEnvironment["enabledSystemSkills"]
): string[] {
  if (!skills.length) {
    return [];
  }

  const lines: string[] = [];

  for (const skill of skills) {
    lines.push(`## ${skill.name}`, stripLeadingMarkdownH1(skill.content), "");
  }

  return lines;
}

function stripLeadingMarkdownH1(content: string): string {
  return content.replace(/^#\s+[^\n]+\n+/, "").trim();
}

function buildUserSkillsSection(): string[] {
  return [
    "## User skills",
    "Custom user skills must be enabled by the user before they become available.",
    "They are NOT included in this prompt by default.",
    "- Call list_skills to browse enabled user skills (slug, name, description).",
    "- Call read_skill with a slug to load full instructions before following them.",
    "- Call create_skill to persist new custom skills when the user wants reusable instructions.",
    "- Call update_skill to modify an existing user skill (name, description, or content).",
    "- New skills are disabled until the user enables them on the Skills page.",
    "- The user may also reference an enabled user skill via /slug in their message.",
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
