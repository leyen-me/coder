import { buildCoreRulesSection } from "./environment/build-system-prompt";
import { joinPromptBlocks } from "./prompt-blocks";

type SubAgentPromptInput = {
  task: string;
  context?: string;
  tools?: string[];
  depth: number;
  maxDepth: number;
};

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
