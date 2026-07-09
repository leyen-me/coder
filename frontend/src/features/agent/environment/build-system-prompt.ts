import type { AgentEnvironment, AgentProjectInstructions } from "./types";
import { joinPromptBlocks } from "../prompt-blocks";
import type { AgentMode } from "@/features/agent/types";

export function buildSystemPrompt(
  environment: AgentEnvironment,
  agentMode?: AgentMode
): string {
  return joinPromptBlocks(buildSystemPromptSections(environment, agentMode));
}

export function buildSystemPromptSections(
  environment: AgentEnvironment,
  agentMode?: AgentMode
): string[] {
  const allBlocks = [
    buildIdentityAndEnvironmentSection(environment, agentMode),
    buildCoreRulesSection().join("\n"),
    ...buildSystemModuleSections(environment),
    buildSkillCatalogSection(environment, agentMode).join("\n"),
  ];

  const projectInstructionsSection = buildProjectInstructionsSection(
    environment.agentsMd
  );
  if (projectInstructionsSection.length) {
    allBlocks.push(projectInstructionsSection.join("\n"));
  }

  const remoteTargetsSection = buildRemoteTargetsSection(
    environment.remoteTargets
  );
  if (remoteTargetsSection.length) {
    allBlocks.push(remoteTargetsSection.join("\n"));
  }

  const modeGuidance = buildModeGuidanceSection(
    agentMode,
    environment.workspaceDir
  );
  if (modeGuidance.length) {
    allBlocks.push(modeGuidance.join("\n"));
  }

  return allBlocks;
}

export function buildIdentityAndEnvironmentSection(
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
      ? "ask (read-only: can read files, search code, browse the web, and ask structured clarification questions — cannot modify files or run shell commands)"
      : agentMode === "plan"
        ? "plan (planning: can read files, search, browse, manage .plan/ files and todos — cannot modify project files or run shell commands)"
        : "agent (full tool access)";

  return [
    "You are Coder, a desktop coding agent.",
    "Use the environment, built-in prompt modules, available skill catalog, and project instructions below as your operating context.",
    "",
    "## Environment",
    "",
    `- workspaceDir: ${workspaceLine}`,
    `- os: ${environment.os}`,
    `- shell: ${environment.shell}`,
    `- gitRepository: ${gitLine}`,
    `- date: ${environment.today}`,
    `- mode: ${modeLine}`,
  ].join("\n");
}

export function buildSystemModuleSections(
  environment: AgentEnvironment
): string[] {
  return environment.systemModules.map(
    (module) => `## ${module.name}\n\n${stripLeadingMarkdownH1(module.content)}`
  );
}

export function buildModeGuidanceSection(
  agentMode: AgentMode | undefined,
  workspaceDir: string | null
): string[] {
  if (agentMode === "ask") {
    return [
      "## Mode Guidance",
      "",
      "You are in Ask mode — stay read-only.",
      "- You may read files, search code, and browse.",
      "- Do not modify files, run shell commands, or perform write operations.",
      "- Use ask_question when key requirements or trade-offs are unclear; prefer one batched call over many small rounds.",
      '- If the task needs write access, say so clearly and tell the user to switch to Agent mode instead of silently refusing.',
    ];
  }

  if (agentMode === "plan") {
    return buildPlanModeGuidance(workspaceDir);
  }

  return [];
}

export function buildRemoteTargetsSection(
  remoteTargets: AgentEnvironment["remoteTargets"]
): string[] {
  if (!remoteTargets.length) {
    return [];
  }

  const targetLines = remoteTargets.map(
    (t) => `  - "${t.alias}" (${t.user}@${t.host}:${t.port})`
  );

  return [
    "## Remote Machines",
    "",
    "You have the following remote machines available:",
    ...targetLines,
    "",
    'Use `remote_shell(target: "<alias>", command: "...")` to execute commands on a remote machine. ' +
    'Set block_until_ms to 0 to run in background and use await to poll, or omit for default 30s timeout. ' +
    'Supports kill_shell and read_shell_logs for background shells. ' +
    "To run commands on the local machine, use the regular `shell` tool instead.",
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
 * - Engineering/coding principles → `## Agent Operating Principles` > `### Core rules`
 * - Tool usage rules → `## Tool Usage` (system skill)
 * - Mode-specific behavior → `## Mode Guidance`
 * - Project-specific instructions → `## Project instructions (AGENTS.md)`
 *
 * Rules are numbered to maximize model compliance. Add new rules at the
 * bottom of the list to avoid renumbering existing ones.
 */
export function buildCoreRulesSection(): string[] {
  return [
    "## Communication Rules",
    "",
    /* 1 */ "1. Reply in the same language the user uses. Be concise, accurate, and direct.",
    /* 2 */ "2. Do not take action unless the user has asked for it. Questions, analysis, and explanations do not require tool use by default.",
    /* 3 */ "3. Lead with the answer or result. Mention process details only when they help the user make a decision or understand risk.",
    /* 4 */ "4. Ask follow-up questions only when blocked, when the choice is costly to reverse, or when no safe default exists.",
  ];
}

export function buildPlanModeGuidance(workspaceDir: string | null): string[] {
  const lines = [
    "## Mode Guidance",
    "",
    "You are in Plan mode — research, analyze, and write a structured Markdown plan to the .plan/ directory.",
    "The plan file is the source of truth and is shown in the plan sheet above the message composer.",
    "",
    "### Plan file workflow",
    "",
    "- Check existing plans with plan_list and plan_read before creating or revising one.",
    "- Use plan_create for a new plan, plan_edit for targeted updates, and plan_update for major rewrites.",
    "- Update the current plan instead of creating duplicates.",
    "- Use plan_delete only when the user explicitly asks to remove an obsolete plan.",
    "",
    "### Filename rules",
    "",
    "- Descriptive slug ending in -plan.md (e.g. refactor-auth-plan.md). Lowercase letters, numbers, and hyphens only.",
    "",
    "### Plan content structure",
    "",
    "Write the plan in Markdown with at least:",
    "- # Title",
    "- ## Goal / context",
    "- ## Steps (numbered, actionable)",
    "- ## Files to touch (when known)",
    "- ## Risks / verification (when relevant)",
    "",
    "### Chat reply",
    "",
    "- Briefly summarize which plan file was created or updated. Do NOT paste the full plan in chat.",
    "- Do NOT include greetings, process narration, tool-call commentary, or closing questions.",
    "",
    "### Tools in this mode",
    "",
    "- Read, search, and browse to inform the plan.",
    "- Use ask_question when key requirements or trade-offs are unclear; prefer one batched call over many small rounds.",
    "- Use todo_write only for short-lived planning progress. It does not replace the plan file.",
    "- Do NOT modify project files, run shell commands, or implement changes.",
    "",
    "### Execution",
    "",
    "- When the user asks to implement, tell them to click \"Build\" (执行) in the plan sheet above the composer to run the plan in Agent mode.",
    "- Do NOT silently attempt implementation.",
  ];

  if (!workspaceDir) {
    lines.push(
      "",
      "### Workspace required",
      "",
      "- plan_create/plan_update/plan_edit require a selected workspace. Ask the user to select one if plan file tools fail."
    );
  }

  return lines;
}

function stripLeadingMarkdownH1(content: string): string {
  return content.replace(/^#\s+[^\n]+\n+/, "").trim();
}

function buildSkillCreationGuidanceLines(): string[] {
  return [
    "",
    "### Creating skills",
    "",
    "Each skill is a directory with a `SKILL.md` file: `{skills-root}/{slug}/SKILL.md`.",
    "Skills without valid frontmatter are silently ignored and cannot be used via `/slug`.",
    "",
    "```markdown",
    "---",
    "name: your-skill-slug",
    "description: Brief description of what this skill does and when to use it",
    "---",
    "",
    "# Your Skill Title",
    "",
    "Instructions body...",
    "```",
    "",
    "- `name` must exactly match the `{slug}` directory name.",
    "- `name` must be lowercase kebab-case (letters, digits, and hyphens only).",
    "- `description` is required and must be non-empty.",
    "- Prefer the workspace skills root for project-specific rules; use the user skills root for personal reusable skills.",
    "- Prefer modifying an existing skill directory instead of creating a duplicate with a similar slug.",
    "- After creation, the skill appears under Available skills and the user can reference it with `/slug`.",
  ];
}

export function buildSkillCatalogSection(
  environment: AgentEnvironment,
  agentMode?: AgentMode
): string[] {
  const canWriteSkills = agentMode !== "plan" && agentMode !== "ask";
  const lines = [
    "## Skill Catalog",
    "",
    "Skills use the standard file-system `SKILL.md` format. Only metadata is listed here by default; read a skill file only when it is relevant.",
    `- User skills root: ${environment.skillRoots.user || "unavailable"}`,
    `- Workspace skills root: ${environment.skillRoots.workspace ?? "unavailable"}`,
    "- Use the listed skill file path with `read_file` when the task clearly matches a skill or the user explicitly references `/slug`.",
    "- A user `/slug` reference is an explicit request to load that skill before following it.",
    ...(canWriteSkills
      ? [
          "- Create or update reusable skills by editing files under the user skills root or workspace skills root.",
          ...buildSkillCreationGuidanceLines(),
        ]
      : []),
  ];

  if (environment.availableSkills.length === 0) {
    lines.push("", "No skills were discovered for the current environment.");
    return lines;
  }

  lines.push("", "### Available skills", "");
  for (const skill of environment.availableSkills) {
    lines.push(
      `- /${skill.slug} | ${skill.name} | ${skill.source} | ${skill.path}`,
      `  ${compactDescription(skill.description)}`
    );
  }

  return lines;
}

function compactDescription(description: string): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }
  return `${normalized.slice(0, 217)}...`;
}

export function buildUserSkillsSection(_agentMode?: AgentMode): string[] {
  return [
    "## Legacy skills",
    "",
    "Dedicated skill tools are disabled. Use the skill catalog above together with normal file tools.",
  ];
}

export function buildProjectInstructionsSection(
  agentsMd: AgentProjectInstructions
): string[] {
  if (!agentsMd?.content.trim()) {
    return [];
  }

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

  return lines;
}
