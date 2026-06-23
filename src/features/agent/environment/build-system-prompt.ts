import type {
  AgentEnvironment,
  AgentEnvironmentInput,
  AgentProjectInstructions,
} from "./types";
import type { AgentMode } from "@/features/agent/types";
import { getLabSettingsSnapshot } from "@/features/lab/lab-settings-store";
import { resolveResponseStylePrompt } from "@/features/lab/storage";

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
      ? "ask (read-only: can read files, search code, browse the web, and list skills ¡ª cannot modify files or run shell commands)"
      : agentMode === "plan"
        ? "plan (planning: can read files, search, browse, manage .plan/ files and todos ¡ª cannot modify project files or run shell commands)"
        : "agent (full tool access)";

  const modeGuidance =
    agentMode === "ask"
      ? [
          "",
          "## Mode Guidance",
          "You are in Ask mode ¡ª you can only read files, search, and browse.",
          "When the user asks you to modify files, run commands, or perform any write operation:",
          "  - Explain that the task requires write access.",
          "  - Tell the user they can switch to Agent mode (click \"Agent\" next to the input) to give you full tool access.",
          "Do NOT silently refuse or just say \"I can't do that.\" Always provide a clear path forward.",
          "",
        ]
      : agentMode === "plan"
        ? buildPlanModeGuidance(environment.workspaceDir)
        : [];

  const stylePrompt = resolveResponseStylePrompt(getLabSettingsSnapshot());
  const isWindows = environment.os.toLowerCase().startsWith("windows");

  const identityLines = stylePrompt
    ? [stylePrompt, ""]
    : ["You are Coder, a helpful desktop AI assistant.", ""];

  return [
    ...identityLines,
    "## Environment",
    `- workspaceDir: ${workspaceLine}`,
    `- os: ${environment.os}`,
    `- shell: ${environment.shell}`,
    `- gitRepository: ${gitLine}`,
    `- date: ${environment.today}`,
    `- mode: ${modeLine}`,
    ...buildCoreRulesSection(),
    ...(isWindows ? [""] : []),
    ...buildSystemPromptSections(environment.enabledSystemSkills),
    ...buildUserSkillsSection(agentMode),
    ...buildProjectInstructionsSection(environment.agentsMd),
    ...buildRemoteTargetsSection(environment.remoteTargets),
    ...modeGuidance,
  ].join("\n");
}

function buildRemoteTargetsSection(
  remoteTargets: AgentEnvironment["remoteTargets"]
): string[] {
  if (!remoteTargets.length) {
    return [];
  }

  const targetLines = remoteTargets.map(
    (t) => `  - "${t.alias}" (${t.user}@${t.host}:${t.port})`
  );

  return [
    "",
    "## Remote Machines",
    "You have the following remote machines available:",
    ...targetLines,
    "",
    'Use `shell(target: "<alias>")` to execute commands on a remote machine. The `target` parameter is optional ¡ª omit it to run commands locally.',
    "",
    "**Limitation:** Only blocking mode (default `block_until_ms=30000`) is supported for remote shells. Background mode (`block_until_ms=0`) does NOT return a usable `shell_id`, so companion tools (`await`, `list_shells`, `kill_shell`, `read_shell_logs`) cannot be used with remote targets. All other tools (file read/write, search, etc.) operate on the local workspace only.",
    "",
  ];
}

/**
 * Builds the `## Communication Rules` section.
 *
 * This section holds numbered rules about **how the model communicates**:
 * - Language adherence (reply in same language as user)
 * - Tone, style, and conciseness
 * - Response formatting expectations
 *
 * What NOT to put here:
 * - Engineering/coding principles ¡ú `## Agent Operating Principles` > `### Core rules`
 * - Tool usage rules ¡ú `## Tool Usage` (system skill)
 * - Mode-specific behavior ¡ú `## Mode Guidance`
 * - Project-specific instructions ¡ú `## Project instructions (AGENTS.md)`
 *
 * Rules are numbered to maximize model compliance. Add new rules at the
 * bottom of the list to avoid renumbering existing ones.
 */
function buildCoreRulesSection(): string[] {
  return [
    "",
    "## Communication Rules",
    "",
    /* 1 */ "1. Reply in the same language the user uses. Be concise, accurate, and friendly.",
    "",
  ];
}

function buildPlanModeGuidance(workspaceDir: string | null): string[] {
  const lines = [
    "",
    "## Mode Guidance",
    "You are in Plan mode ¡ª research, analyze, and write a structured Markdown plan to the .plan/ directory.",
    "The plan file is the source of truth. The user reviews it in the right panel Plan tab.",
    "",
    "### Plan file workflow",
    "- Before creating or revising, call plan_list (and plan_read when needed) to inspect existing plans.",
    "- Use plan_create only for a new topic with a new filename. It fails if the file already exists.",
    "- Use plan_edit for targeted changes to an existing plan (search-and-replace). Prefer this over plan_update for small edits, appending steps, or revising specific sections.",
    "- Use plan_update for major rewrites where you need to replace the entire plan content. For localized changes, use plan_edit instead.",
    "- When the user asks to change the current plan, update that plan file; do not create a duplicate.",
    "- Use plan_delete only when the user explicitly asks to remove an obsolete plan.",
    "",
    "### Filename rules",
    "- Descriptive slug ending in -plan.md (e.g. refactor-auth-plan.md). Lowercase letters, numbers, and hyphens only.",
    "",
    "### Plan content structure",
    "Write the full plan in the file using Markdown with at least:",
    "- # Title",
    "- ## Goal / context",
    "- ## Steps (numbered, actionable)",
    "- ## Files to touch (when known)",
    "- ## Risks / verification (when relevant)",
    "",
    "### Chat reply",
    "- Briefly summarize which plan file was created or updated. Do NOT paste the full plan in chat.",
    "- Do NOT include greetings, process narration, tool-call commentary, or closing questions.",
    "",
    "### Tools in this mode",
    "- Read, search, and browse to inform the plan.",
    "- When important requirements or trade-offs are unclear, call ask_question to ask the user a batch of structured clarification questions before you continue.",
    "- Prefer one ask_question call with all necessary questions instead of many one-question rounds.",
    "- For ask_question, provide clear options. The UI always adds an Other/custom-text option for every question.",
    "- After calling ask_question, wait for the user's answers and then continue the same planning run.",
    "- Use todo_write for short-lived planning-step tracking during this session.",
    "- todo_write does NOT replace the plan file; always persist the full plan with plan_create/plan_update/plan_edit.",
    "- Do NOT modify project files, run shell commands, or implement changes.",
    "",
    "### Execution",
    "- When the user asks to implement, tell them to open the right panel Plan tab and click \"Build\" (Ö´ÐÐ) to run the plan in Agent mode.",
    "- Do NOT silently attempt implementation. Keep the user in the planning loop until they explicitly build.",
  ];

  if (!workspaceDir) {
    lines.push(
      "",
      "### Workspace required",
      "- plan_create/plan_update/plan_edit require a selected workspace. Ask the user to select one if plan file tools fail."
    );
  }

  lines.push("");
  return lines;
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

function buildUserSkillsSection(agentMode?: AgentMode): string[] {
  const canWriteSkills = agentMode !== "plan" && agentMode !== "ask";

  return [
    "## User skills",
    "Custom user skills must be enabled by the user before they become available.",
    "They are NOT included in this prompt by default.",
    "- Call list_skills to browse enabled user skills (slug, name, description).",
    "- Call read_skill with a slug to load full instructions before following them.",
    ...(canWriteSkills
      ? [
          "- Call create_skill to persist new custom skills when the user wants reusable instructions.",
          "- Call update_skill to modify an existing user skill (name, description, or content).",
        ]
      : []),
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
    remoteTargets: input.remoteTargets ?? [],
  };
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
