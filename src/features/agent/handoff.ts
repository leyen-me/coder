import type { AgentContextUsageSnapshot } from "./types";

export const AGENT_HANDOFF_SYSTEM_PROMPT = `You are preparing a structured handoff for the next session of the same coding agent.
Write in the same language as the conversation.
Output markdown only.
Be concrete, concise, and evidence-based.
Do not invent files, tests, decisions, or background jobs.
If something is unknown, say "Unknown".
This handoff is for an unattended continuation flow: the next session should keep going autonomously whenever a reasonable default or verifiable next step exists.

Use exactly these sections and keep the order:
## Original User Intent
## Current Objective
## Constraints
## Completed
## In Progress
## Pending Next Actions
## Key Decisions
## Rejected Or Superseded Approaches
## Artifacts And Evidence
## Background Jobs And Follow-ups
## Open Questions
## Resume Instructions`;

export function buildAgentHandoffUserPrompt(input: {
  sessionTitle: string;
  contextUsage: AgentContextUsageSnapshot;
  sessionKind: "standard" | "long_task";
  autonomyMode: "interactive" | "unattended";
  decisionPolicyVersion: string;
  decisionModel: string | null;
}): string {
  return [
    "Create a handoff document for a fresh session that has no memory of the previous conversation.",
    "The next session should be able to continue immediately without repeating completed work except when verification is necessary.",
    "",
    "Handoff requirements:",
    "- Preserve intent, constraints, decisions, evidence, and next steps.",
    "- Call out any risky or destructive next actions explicitly.",
    "- Mention unfinished tools, background jobs, watchers, or commands only if they are actually known from the conversation.",
    "- Prefer autonomous continuation. If the original task would normally require clarification, recommend the safest reasonable default and record that assumption explicitly.",
    "- Only describe the task as blocked if there is truly no reasonable action the next session can take.",
    "",
    "Current rollover context:",
    `- sourceSessionTitle: ${sanitizeInlineValue(input.sessionTitle)}`,
    `- sessionKind: ${input.sessionKind}`,
    `- autonomyMode: ${input.autonomyMode}`,
    `- decisionPolicyVersion: ${sanitizeInlineValue(input.decisionPolicyVersion)}`,
    `- decisionModel: ${sanitizeInlineValue(input.decisionModel ?? "default")}`,
    `- usedTokens: ${input.contextUsage.usedTokens}`,
    `- maxTokens: ${input.contextUsage.maxTokens}`,
    `- remainingTokens: ${input.contextUsage.remainingTokens}`,
    `- reservedTokens: ${input.contextUsage.reservedTokens}`,
    `- triggerThreshold: ${input.contextUsage.triggerThreshold}`,
  ].join("\n");
}

export function buildStoredHandoffArtifact(input: {
  sourceSessionId: string;
  continuedSessionId: string;
  sourceSessionTitle: string;
  generatedAt: string;
  model: string;
  contextUsage: AgentContextUsageSnapshot;
  sessionKind: "standard" | "long_task";
  autonomyMode: "interactive" | "unattended";
  decisionPolicyVersion: string;
  decisionModel: string | null;
  handoffBody: string;
}): string {
  const body = normalizeHandoffBody(input.handoffBody);

  return [
    "# Automatic Session Handoff",
    "",
    `- sourceSessionId: ${input.sourceSessionId}`,
    `- continuedSessionId: ${input.continuedSessionId}`,
    `- sourceSessionTitle: ${sanitizeInlineValue(input.sourceSessionTitle)}`,
    `- generatedAt: ${sanitizeInlineValue(input.generatedAt)}`,
    `- model: ${sanitizeInlineValue(input.model)}`,
    `- sessionKind: ${input.sessionKind}`,
    `- autonomyMode: ${input.autonomyMode}`,
    `- decisionPolicyVersion: ${sanitizeInlineValue(input.decisionPolicyVersion)}`,
    `- decisionModel: ${sanitizeInlineValue(input.decisionModel ?? "default")}`,
    `- contextBudget: ${input.contextUsage.usedTokens}/${input.contextUsage.maxTokens} used, ${input.contextUsage.remainingTokens} remaining, reserve ${input.contextUsage.reservedTokens}`,
    "",
    body,
  ].join("\n");
}

export function buildContinuationPrompt(input: {
  handoffArtifact: string;
  sourceSessionTitle: string;
  sessionKind: "standard" | "long_task";
  autonomyMode: "interactive" | "unattended";
  decisionPolicyVersion: string;
}): string {
  return [
    "A previous session of this task reached its context budget and handed off the work.",
    "Treat the handoff below as the authoritative working state written by the previous session.",
    "Continue from it without repeating completed work unless verification is necessary.",
    "Continue autonomously without waiting for user input whenever a safe, conservative, and reversible next step exists.",
    "When clarification would normally help, choose the best reasonable default, record the assumption in your work, and keep moving.",
    "Only stop to ask the user if proceeding is literally impossible without information that cannot be inferred or safely defaulted.",
    "",
    `Previous session: ${sanitizeInlineValue(input.sourceSessionTitle)}`,
    `Session policy: ${input.sessionKind} / ${input.autonomyMode} / ${sanitizeInlineValue(input.decisionPolicyVersion)}`,
    "",
    input.handoffArtifact.trim(),
  ].join("\n");
}

export function buildFallbackHandoffBody(input: {
  userContent: string;
  sourceSessionTitle: string;
}): string {
  return [
    "## Original User Intent",
    input.userContent.trim() || "Unknown",
    "",
    "## Current Objective",
    `Continue the task from session "${sanitizeInlineValue(input.sourceSessionTitle)}".`,
    "",
    "## Constraints",
    "- Preserve the user's original intent and avoid repeating completed work.",
    "",
    "## Completed",
    "- Unknown. Review the previous session history before continuing.",
    "",
    "## In Progress",
    "- Automatic handoff generation failed; verify the latest assistant message and tool outputs.",
    "",
    "## Pending Next Actions",
    "1. Review the previous session's latest assistant/tool outputs.",
    "2. Reconstruct the exact current state before making more changes.",
    "",
    "## Key Decisions",
    "- Unknown",
    "",
    "## Rejected Or Superseded Approaches",
    "- Unknown",
    "",
    "## Artifacts And Evidence",
    "- Previous session chat history",
    "",
    "## Background Jobs And Follow-ups",
    "- Unknown",
    "",
    "## Open Questions",
    "- Unknown. If needed, proceed with conservative assumptions and record them.",
    "",
    "## Resume Instructions",
    "Start by validating the prior state instead of assuming the handoff is complete.",
    "Then continue autonomously using the safest reasonable defaults; only stop if progress is impossible without new external information.",
  ].join("\n");
}

export function deriveContinuationSessionTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed ? `Continue · ${trimmed}` : "Continue · Session";
}

function normalizeHandoffBody(body: string): string {
  const trimmed = body.trim();
  return trimmed || buildFallbackHandoffBody({ userContent: "", sourceSessionTitle: "" });
}

function sanitizeInlineValue(value: string): string {
  return value.trim().replace(/\s+/g, " ") || "Unknown";
}
