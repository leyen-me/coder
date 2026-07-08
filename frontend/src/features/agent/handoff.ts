import type { AgentContextUsageSnapshot } from "./types";
import { buildHandoffSystemPrompt } from "./auxiliary-prompts";
import type { MessageKind, MessageRecord } from "@/lib/db/types";
import type {
  HandoffBackgroundJob,
  HandoffGitSnapshot,
  HandoffVerificationSnapshot,
} from "./handoff-snapshot";

export const HANDOFF_ARTIFACT_HEADING = "# Automatic Session Handoff";

export const HANDOFF_CONTINUATION_PROMPT_PREFIX =
  "A previous session of this task reached its context budget and handed off the work.";

const WORKING_SET_LIMIT = 12;
const DECISION_SNIPPET_LIMIT = 3;

export type HandoffWorkingSetEntry = {
  path: string;
  operationType: "read" | "write" | "edit" | "replace" | "search";
  lastOperation: string;
  createdAt: number;
  needsVerification?: boolean;
  lastKnownHash?: string | null;
};

export type HandoffSupplementalContext = {
  workingSet: HandoffWorkingSetEntry[];
  gitSnapshot?: HandoffGitSnapshot | null;
  verification?: HandoffVerificationSnapshot | null;
  backgroundJobs?: HandoffBackgroundJob[];
  historyFilePath?: string | null;
  toolArchiveIndexPath?: string | null;
  chainManifestPath?: string | null;
  assumptions?: string[];
  knownErrors?: string[];
  decisionSummaries?: string[];
};

export type HandoffQualityReport = {
  ok: boolean;
  failures: string[];
};

export type ParsedHandoffArtifact = {
  metadata: Record<string, string>;
  body: string;
  sourceSessionId: string | null;
  continuedSessionId: string | null;
  sourceSessionTitle: string | null;
  contextBudget: string | null;
  generatedAt: string | null;
};

export const AGENT_HANDOFF_SYSTEM_PROMPT = buildHandoffSystemPrompt();

export function buildAgentHandoffUserPrompt(input: {
  sessionTitle: string;
  contextUsage: AgentContextUsageSnapshot;
  sessionKind: "standard" | "long_task";
  autonomyMode: "interactive" | "unattended";
  decisionPolicyVersion: string;
  decisionModel: string | null;
  qualityFailures?: readonly string[];
}): string {
  const lines = [
    "Create a handoff document for a fresh session that has no memory of the previous conversation.",
    "The next session should trust the working set and archived tool outputs, continuing immediately with minimal verification.",
    "",
    "Handoff requirements:",
    "- Preserve intent, constraints, decisions, evidence, and next steps.",
    "- Call out any risky or destructive next actions explicitly.",
    "- Mention unfinished tools, background jobs, watchers, or commands only if they are actually known from the conversation.",
    "- Prefer autonomous continuation. If the original task would normally require clarification, recommend the safest reasonable default and record that assumption explicitly.",
    "- Only describe the task as blocked if there is truly no reasonable action the next session can take.",
    "- Include at least one concrete file path in Pending Next Actions when files were touched.",
    "- If no tests were run, write Unknown under Artifacts And Evidence.",
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
  ];

  if (input.qualityFailures && input.qualityFailures.length > 0) {
    lines.push(
      "",
      "Previous attempt failed quality checks. Fix these issues:",
      ...input.qualityFailures.map((failure) => `- ${failure}`)
    );
  }

  return lines.join("\n");
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
  supplementalContext?: HandoffSupplementalContext | null;
}): string {
  const body = normalizeHandoffBody(
    buildAugmentedHandoffBody(input.handoffBody, input.supplementalContext ?? null)
  );

  return [
    HANDOFF_ARTIFACT_HEADING,
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

export function buildAugmentedHandoffBody(
  handoffBody: string,
  supplementalContext: HandoffSupplementalContext | null
): string {
  return appendSupplementalSections(handoffBody, supplementalContext);
}

export function buildContinuationPrompt(input: {
  handoffArtifact: string;
  sourceSessionTitle: string;
  sessionKind: "standard" | "long_task";
  autonomyMode: "interactive" | "unattended";
  decisionPolicyVersion: string;
  workingSet?: HandoffWorkingSetEntry[];
  verificationChecklist?: string[];
  toolArchiveIndexPath?: string | null;
  historyFilePath?: string | null;
  chainManifestPath?: string | null;
}): string {
  const checklist = input.verificationChecklist ?? [];
  const workingSet = input.workingSet ?? [];
  return [
    "A previous session of this task reached its context budget and handed off the work.",
    "Treat the handoff below as the authoritative working state written by the previous session.",
    "Default to trusting the handoff, working set, code delta, and archived evidence.",
    "Continue autonomously without waiting for user input whenever a safe, conservative, and reversible next step exists.",
    "When clarification would normally help, choose the best reasonable default, record the assumption in your work, and keep moving.",
    "Only stop to ask the user if proceeding is literally impossible without information that cannot be inferred or safely defaulted.",
    "",
    "Rules:",
    "1. Execute Pending Next Actions immediately if the verification checklist passes.",
    "2. Do NOT re-read files listed in the Working Set unless you are about to edit them, verification failed, or the handoff marks them as needs_verification.",
    "3. Do NOT glob or broadly explore the codebase just to re-understand the project.",
    "4. Prefer source session history and tool archive evidence over re-running prior read/search commands.",
    "5. During the first 1-2 turns, keep exploration extremely small and justify any extra verification.",
    "",
    `Previous session: ${sanitizeInlineValue(input.sourceSessionTitle)}`,
    `Session policy: ${input.sessionKind} / ${input.autonomyMode} / ${sanitizeInlineValue(input.decisionPolicyVersion)}`,
    "",
    ...(workingSet.length > 0
      ? [
          "## Continuation Working Set",
          ...workingSet.slice(0, 5).map((entry, index) => {
            const flags = [
              entry.operationType,
              entry.needsVerification ? "needs_verification" : "trusted",
            ].join(", ");
            return `${index + 1}. ${entry.path} (${flags})`;
          }),
          "",
        ]
      : []),
    ...(checklist.length > 0
      ? [
          "## Continuation Verification Checklist",
          ...checklist.map((item, index) => `${index + 1}. ${item}`),
          "",
        ]
      : []),
    "## Exploration Budget (Turns 1-2)",
    "- Maximum 2 targeted file reads.",
    "- Zero broad glob/codebase exploration unless checklist verification fails.",
    "- Prefer archived tool output and git delta before re-running tools.",
    "",
    ...(input.toolArchiveIndexPath
      ? [`Tool archive index: ${input.toolArchiveIndexPath}`, ""]
      : []),
    ...(input.historyFilePath
      ? [`Source session history: ${input.historyFilePath}`, ""]
      : []),
    ...(input.chainManifestPath
      ? [`Session chain manifest: ${input.chainManifestPath}`, ""]
      : []),
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
    "Trust the latest persisted evidence first, then perform only the minimum verification needed to continue safely.",
    "Continue autonomously using the safest reasonable defaults; only stop if progress is impossible without new external information.",
  ].join("\n");
}

export function deriveContinuationSessionTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed ? `Continue · ${trimmed}` : "Continue · Session";
}

export function isHandoffArtifactContent(content: string): boolean {
  return content.trimStart().startsWith(HANDOFF_ARTIFACT_HEADING);
}

export function isHandoffContinuationPrompt(content: string): boolean {
  return content.trimStart().startsWith(HANDOFF_CONTINUATION_PROMPT_PREFIX);
}

export function extractHandoffArtifactFromContinuationPrompt(
  content: string
): string | null {
  const markerIndex = content.indexOf(HANDOFF_ARTIFACT_HEADING);
  if (markerIndex === -1) {
    return null;
  }

  return content.slice(markerIndex).trim() || null;
}

export function parseStoredHandoffArtifact(
  content: string
): ParsedHandoffArtifact | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith(HANDOFF_ARTIFACT_HEADING)) {
    return null;
  }

  const lines = trimmed.split("\n");
  const metadata: Record<string, string> = {};
  let bodyStartIndex = 1;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      bodyStartIndex = index + 1;
      continue;
    }

    if (!line.startsWith("- ")) {
      bodyStartIndex = index;
      break;
    }

    const separatorIndex = line.indexOf(": ");
    if (separatorIndex === -1) {
      bodyStartIndex = index;
      break;
    }

    const key = line.slice(2, separatorIndex).trim();
    const value = line.slice(separatorIndex + 2).trim();
    if (key) {
      metadata[key] = value;
    }
    bodyStartIndex = index + 1;
  }

  while (bodyStartIndex < lines.length && !lines[bodyStartIndex]?.trim()) {
    bodyStartIndex += 1;
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim();

  return {
    metadata,
    body,
    sourceSessionId: metadata.sourceSessionId ?? null,
    continuedSessionId: metadata.continuedSessionId ?? null,
    sourceSessionTitle: metadata.sourceSessionTitle ?? null,
    contextBudget: metadata.contextBudget ?? null,
    generatedAt: metadata.generatedAt ?? null,
  };
}

export function extractWorkingSet(
  messages: ReadonlyArray<MessageRecord>,
  limit = WORKING_SET_LIMIT
): HandoffWorkingSetEntry[] {
  const recentEntries: HandoffWorkingSetEntry[] = [];

  for (const message of messages) {
    for (const invocation of message.toolInvocations ?? []) {
      const path = extractInvocationPath(invocation.input);
      const entry = toWorkingSetEntry(invocation.name, path, message.createdAt, invocation);
      if (!entry) {
        continue;
      }
      recentEntries.push(entry);
    }
  }

  const deduped = new Map<string, HandoffWorkingSetEntry>();
  for (const entry of recentEntries) {
    deduped.set(entry.path, entry);
  }

  return [...deduped.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function extractReferencedSkillSlugs(
  messages: ReadonlyArray<MessageRecord>
): string[] {
  const skills = new Set<string>();
  for (const message of messages) {
    for (const slug of message.referencedSkills ?? []) {
      const trimmed = slug.trim();
      if (trimmed) {
        skills.add(trimmed);
      }
    }
  }
  return [...skills];
}

export function extractDecisionSummaries(
  messages: ReadonlyArray<MessageRecord>,
  limit = DECISION_SNIPPET_LIMIT
): string[] {
  const summaries: string[] = [];
  for (const message of messages) {
    for (const step of message.processSteps ?? []) {
      if (step.kind !== "decision") {
        continue;
      }
      const reason = step.response?.reason?.trim();
      summaries.push(
        [step.summary.trim(), reason ? `Reason: ${reason}` : null]
          .filter(Boolean)
          .join(" ")
      );
    }
  }
  return summaries.slice(-limit);
}

export function extractKnownErrorFingerprints(
  messages: ReadonlyArray<MessageRecord>
): string[] {
  const errors: string[] = [];
  for (const message of messages) {
    for (const invocation of message.toolInvocations ?? []) {
      if (!invocation.errorText?.trim()) {
        continue;
      }
      errors.push(`${invocation.name}: ${invocation.errorText.trim()}`);
    }
  }
  return uniqueStrings(errors).slice(-6);
}

export function extractAssumptionsFromBody(body: string): string[] {
  return extractBulletSectionItems(body, "Assumptions");
}

export function extractOpenRisksFromBody(body: string): string[] {
  return extractBulletSectionItems(body, "Open Questions");
}

export function extractInvariantsFromBody(body: string): string[] {
  return extractBulletSectionItems(body, "Constraints");
}

export function extractPendingNextActions(body: string): string[] {
  return extractBulletSectionItems(body, "Pending Next Actions");
}

export function buildVerificationChecklist(input: {
  verification?: HandoffVerificationSnapshot | null;
  workingSet: HandoffWorkingSetEntry[];
  backgroundJobs?: HandoffBackgroundJob[];
}): string[] {
  const checklist: string[] = [];

  if (input.verification?.lastTestCommand) {
    checklist.push(
      `Re-run \`${input.verification.lastTestCommand}\` and expect exit code ${input.verification.lastTestExitCode ?? "Unknown"}.`
    );
  }

  if (input.workingSet[0]) {
    checklist.push(
      `Confirm \`${input.workingSet[0].path}\` still matches the handoff before editing.`
    );
  }

  const runningJob = input.backgroundJobs?.find((job) => job.status === "running");
  if (runningJob) {
    checklist.push(
      `Check running shell ${runningJob.shellId} in \`${runningJob.workingDirectory}\` before starting duplicate processes.`
    );
  }

  if (checklist.length === 0) {
    checklist.push("Validate the immediately next file or command only if the handoff evidence looks stale.");
  }

  return checklist;
}

export function evaluateHandoffQuality(input: {
  handoffBody: string;
  workingSet: HandoffWorkingSetEntry[];
  verification?: HandoffVerificationSnapshot | null;
}): HandoffQualityReport {
  const failures: string[] = [];
  const concretePathCount = countConcreteHandoffPaths(
    input.handoffBody,
    input.workingSet
  );
  const artifactsSection =
    extractSectionBody(input.handoffBody, "Artifacts And Evidence") ?? "";
  const hasVerificationEvidence =
    Boolean(input.verification?.lastTestCommand) ||
    Boolean(input.verification?.lastBuildCommand) ||
    /Unknown/i.test(artifactsSection) ||
    artifactsSection.trim().length > 0;

  if (extractPendingNextActions(input.handoffBody).length === 0) {
    failures.push("Missing pending next actions.");
  }
  if (concretePathCount < 1) {
    failures.push("Not enough concrete file paths.");
  }
  if (
    !hasSectionContent(input.handoffBody, "Key Decisions") &&
    !/## Key Decisions\s+Unknown/i.test(input.handoffBody)
  ) {
    failures.push("Key Decisions is empty.");
  }
  if (!hasVerificationEvidence) {
    failures.push("Verification state is missing.");
  }
  if (input.workingSet.length === 0) {
    failures.push("Working set is empty.");
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function resolveHandoffMessageKind(
  message: Pick<MessageRecord, "role" | "messageKind" | "content">
): MessageKind | null {
  if (
    message.messageKind === "handoff" ||
    message.messageKind === "handoff_continuation"
  ) {
    return message.messageKind;
  }

  if (message.role === "assistant" && isHandoffArtifactContent(message.content)) {
    return "handoff";
  }

  if (
    message.role === "user" &&
    isHandoffContinuationPrompt(message.content)
  ) {
    return "handoff_continuation";
  }

  return null;
}

export function findLatestHandoffArtifactMessage(
  messages: ReadonlyArray<Pick<MessageRecord, "role" | "messageKind" | "content">>
): Pick<MessageRecord, "role" | "messageKind" | "content"> | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (resolveHandoffMessageKind(message) === "handoff") {
      return message;
    }
  }

  return null;
}

export function resolveContinuedSessionIdFromMessages(
  messages: ReadonlyArray<Pick<MessageRecord, "role" | "messageKind" | "content">>
): string | null {
  const handoffMessage = findLatestHandoffArtifactMessage(messages);
  if (!handoffMessage) {
    return null;
  }

  return (
    parseStoredHandoffArtifact(handoffMessage.content)?.continuedSessionId ?? null
  );
}

function appendSupplementalSections(
  handoffBody: string,
  supplementalContext: HandoffSupplementalContext | null
): string {
  const trimmed = handoffBody.trim();
  if (!supplementalContext) {
    return trimmed;
  }

  const sections: string[] = [];

  if (supplementalContext.workingSet.length > 0) {
    sections.push("## Working Set");
    sections.push("| Path | Last Operation | Operation Type |");
    sections.push("|------|----------------|----------------|");
    for (const entry of supplementalContext.workingSet) {
      sections.push(
        `| ${entry.path} | ${entry.lastOperation} | ${entry.operationType}${entry.needsVerification ? " (needs_verification)" : ""} |`
      );
    }
    sections.push("");
  }

  if (supplementalContext.gitSnapshot) {
    sections.push("## Code Delta");
    sections.push(
      `- branch: ${sanitizeInlineValue(supplementalContext.gitSnapshot.branch ?? "Unknown")}`
    );
    sections.push("");
    sections.push("```text");
    sections.push(formatSnapshotBlock("git status --short", supplementalContext.gitSnapshot.statusShort));
    sections.push(formatSnapshotBlock("git diff --stat", supplementalContext.gitSnapshot.diffStat));
    sections.push(formatSnapshotBlock("git diff", supplementalContext.gitSnapshot.unstagedDiff));
    sections.push(formatSnapshotBlock("git diff --staged", supplementalContext.gitSnapshot.stagedDiff));
    sections.push(formatSnapshotBlock("git log --oneline -n 20", supplementalContext.gitSnapshot.recentLog));
    sections.push("```");
    sections.push("");
  }

  if (supplementalContext.verification) {
    sections.push("## Verification");
    sections.push("```yaml");
    sections.push(
      `last_test_command: ${yamlScalar(supplementalContext.verification.lastTestCommand)}`
    );
    sections.push(
      `last_test_exit_code: ${yamlScalar(supplementalContext.verification.lastTestExitCode)}`
    );
    sections.push(
      `last_build_command: ${yamlScalar(supplementalContext.verification.lastBuildCommand)}`
    );
    sections.push(
      `last_build_exit_code: ${yamlScalar(supplementalContext.verification.lastBuildExitCode)}`
    );
    if (supplementalContext.verification.failingCommandSnippet) {
      sections.push(
        `failure_snippet: ${yamlScalar(supplementalContext.verification.failingCommandSnippet)}`
      );
    }
    sections.push("```");
    sections.push("");
  }

  if (supplementalContext.backgroundJobs?.length) {
    sections.push("## Background Job Snapshot");
    for (const job of supplementalContext.backgroundJobs) {
      sections.push(
        `- ${job.shellId}: ${job.command} (${job.status}${job.exitCode !== undefined ? `, exit ${job.exitCode}` : ""})`
      );
      if (job.lastOutput) {
        sections.push(`  Last output: ${job.lastOutput}`);
      }
    }
    sections.push("");
  }

  if (supplementalContext.decisionSummaries?.length) {
    sections.push("## Decision Trace");
    for (const summary of supplementalContext.decisionSummaries) {
      sections.push(`- ${summary}`);
    }
    sections.push("");
  }

  if (supplementalContext.knownErrors?.length) {
    sections.push("## Known Errors Already Investigated");
    for (const error of supplementalContext.knownErrors) {
      sections.push(`- ${error}`);
    }
    sections.push("");
  }

  if (supplementalContext.assumptions?.length) {
    sections.push("## Assumptions");
    for (const assumption of supplementalContext.assumptions) {
      sections.push(`- ${assumption}`);
    }
    sections.push("");
  }

  if (
    supplementalContext.historyFilePath ||
    supplementalContext.toolArchiveIndexPath ||
    supplementalContext.chainManifestPath
  ) {
    sections.push("## Source Session Resources");
    if (supplementalContext.historyFilePath) {
      sections.push(`- history: ${supplementalContext.historyFilePath}`);
    }
    if (supplementalContext.toolArchiveIndexPath) {
      sections.push(`- toolArchiveIndex: ${supplementalContext.toolArchiveIndexPath}`);
    }
    if (supplementalContext.chainManifestPath) {
      sections.push(`- chainManifest: ${supplementalContext.chainManifestPath}`);
    }
    sections.push("");
  }

  return [trimmed, sections.join("\n").trim()].filter(Boolean).join("\n\n");
}

function normalizeHandoffBody(body: string): string {
  const trimmed = body.trim();
  return trimmed || buildFallbackHandoffBody({ userContent: "", sourceSessionTitle: "" });
}

function sanitizeInlineValue(value: string): string {
  return value.trim().replace(/\s+/g, " ") || "Unknown";
}

function toWorkingSetEntry(
  toolName: string,
  path: string | null,
  createdAt: number,
  invocation: Pick<MessageRecord["toolInvocations"][number], "output">
): HandoffWorkingSetEntry | null {
  const normalizedTool = toolName.trim();
  if (!normalizedTool) {
    return null;
  }

  const operationType = resolveWorkingSetOperationType(normalizedTool);
  if (!operationType) {
    return null;
  }

  const effectivePath = path ?? `[${normalizedTool}]`;
  const hash = extractInvocationSha(invocation.output);

  return {
    path: effectivePath,
    operationType,
    lastOperation: new Date(createdAt).toISOString(),
    createdAt,
    lastKnownHash: hash,
  };
}

function resolveWorkingSetOperationType(
  toolName: string
): HandoffWorkingSetEntry["operationType"] | null {
  if (toolName === "read_file") {
    return "read";
  }
  if (toolName === "write_file") {
    return "write";
  }
  if (toolName === "edit_file") {
    return "edit";
  }
  if (toolName === "replace_file" || toolName === "replace_lines") {
    return "replace";
  }
  if (toolName === "glob" || toolName === "grep") {
    return "search";
  }
  return null;
}

function extractInvocationPath(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const candidate = record.path ?? record.target_directory ?? record.absolute_path;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function extractInvocationSha(output: unknown): string | null {
  if (typeof output !== "object" || output === null) {
    return null;
  }
  const record = output as Record<string, unknown>;
  const data =
    typeof record.data === "object" && record.data !== null
      ? (record.data as Record<string, unknown>)
      : record;
  const sha = data.sha256;
  return typeof sha === "string" && sha.trim() ? sha.trim() : null;
}

function extractMentionedFilePaths(body: string): string[] {
  const matches = body.match(/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+/g) ?? [];
  return uniqueStrings(matches);
}

function countConcreteHandoffPaths(
  body: string,
  workingSet: HandoffWorkingSetEntry[]
): number {
  const paths = new Set(extractMentionedFilePaths(body));
  for (const entry of workingSet) {
    const trimmed = entry.path.trim();
    if (trimmed && !trimmed.startsWith("[")) {
      paths.add(trimmed);
    }
  }
  return paths.size;
}

function hasSectionContent(body: string, heading: string): boolean {
  const section = extractSectionBody(body, heading);
  return Boolean(section?.trim());
}

function extractSectionBody(body: string, heading: string): string | null {
  const pattern = new RegExp(
    `## ${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n## [^\\n]+\\n|$)`,
    "i"
  );
  const match = body.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function extractBulletSectionItems(body: string, heading: string): string[] {
  const section = extractSectionBody(body, heading);
  if (!section) {
    return [];
  }
  return uniqueStrings(
    section
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
      .filter(Boolean)
  );
}

function formatSnapshotBlock(title: string, content: string): string {
  return [`$ ${title}`, content.trim() || "(empty)", ""].join("\n");
}

function yamlScalar(value: string | number | null): string {
  if (value === null) {
    return "Unknown";
  }
  if (typeof value === "number") {
    return `${value}`;
  }
  return JSON.stringify(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
