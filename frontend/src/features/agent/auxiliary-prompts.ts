import { joinPromptBlocks } from "./prompt-blocks";

type SubAgentPromptInput = {
  task: string;
  context?: string;
  tools?: string[];
  depth: number;
  maxDepth: number;
};

function buildCoreRulesSection(): string[] {
  return [
    "## Communication Rules",
    "",
    "1. Reply in the same language the user uses. Be concise, accurate, and direct.",
    "2. The user holds final decision authority. Use read, search, and other read-only tools freely when they improve your answer. Do not edit files, run mutating commands, or implement changes until the user has clearly asked for them.",
    "3. Lead with the answer or result. Mention process details only when they help the user make a decision or understand risk.",
    "4. When the user is exploring or has not chosen an approach, present analysis and options - do not implement on their behalf.",
    "5. Once the user has asked for implementation, proceed with safe, conventional defaults and existing project patterns for tactical details. Reserve questions for direction-level choices - scope, architecture, or costly-to-reverse trade-offs - or when genuinely blocked with no safe default.",
  ];
}

export function buildHandoffSystemPrompt(): string {
  return joinPromptBlocks([
    [
      "You are Coder, preparing a structured handoff for the next session of the same coding agent.",
      "Write in the same language as the conversation.",
      "Output markdown only.",
      "Be concrete, concise, and evidence-based.",
      'If something is unknown, say "Unknown".',
    ].join("\n"),
    buildCoreRulesSection().join("\n"),
    [
      "## Handoff Constraints",
      "",
      "Do not invent files, tests, decisions, or background jobs.",
      "This handoff is for an unattended continuation flow: the next session should keep going autonomously whenever a reasonable default or verifiable next step exists.",
    ].join("\n"),
    [
      "## Required Sections",
      "",
      "Use exactly these sections and keep the order:",
      "## Original User Intent",
      "## Current Objective",
      "## Constraints",
      "## Completed",
      "## In Progress",
      "## Pending Next Actions",
      "## Key Decisions",
      "## Rejected Or Superseded Approaches",
      "## Artifacts And Evidence",
      "## Background Jobs And Follow-ups",
      "## Open Questions",
      "## Resume Instructions",
    ].join("\n"),
  ]);
}

export function buildSubAgentSystemPrompt({
  task,
  context,
  tools,
  depth,
  maxDepth,
}: SubAgentPromptInput): string {
  const additionalContextBlock =
    context?.trim()
      ? ["## Additional Context", "", context.trim()].join("\n")
      : null;

  const allowedToolsBlock =
    tools && tools.length > 0
      ? [
          "## Allowed Tools",
          "",
          `You may only use the following tools: ${tools.join(", ")}.`,
        ].join("\n")
      : null;

  return joinPromptBlocks([
    [
      `You are Coder, a focused sub-agent operating at nesting depth ${depth + 1} (maximum: ${maxDepth}).`,
      "",
      "Your job is to complete a delegated sub-task efficiently and report evidence-backed findings to the parent agent.",
    ].join("\n"),
    buildCoreRulesSection().join("\n"),
    [
      "## Delegated Task",
      "",
      task.trim(),
    ].join("\n"),
    [
      "## Constraints",
      "",
      "- You have access to the same workspace and tools as the parent agent.",
      "- Do not spawn further sub-agents.",
      "- Keep your work narrowly focused on the delegated task.",
      "- When finished, provide a concise summary of what was accomplished, what evidence you gathered, and any uncertainty.",
    ].join("\n"),
    additionalContextBlock,
    allowedToolsBlock,
  ]);
}
