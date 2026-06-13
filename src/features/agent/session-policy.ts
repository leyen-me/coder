import {
  DEFAULT_DECISION_POLICY_VERSION,
  DEFAULT_SESSION_AUTONOMY_MODE,
  DEFAULT_SESSION_KIND,
  type SessionAutonomyMode,
  type SessionKind,
  type SessionRecord,
} from "@/lib/db";

export type AgentSessionPolicy = {
  sessionKind: SessionKind;
  autonomyMode: SessionAutonomyMode;
  decisionPolicyVersion: string;
  decisionModel: string | null;
};

export function resolveAgentSessionPolicy(
  session: Pick<
    SessionRecord,
    "sessionKind" | "autonomyMode" | "decisionPolicyVersion" | "decisionModel"
  > | null | undefined
): AgentSessionPolicy {
  return {
    sessionKind: session?.sessionKind ?? DEFAULT_SESSION_KIND,
    autonomyMode: session?.autonomyMode ?? DEFAULT_SESSION_AUTONOMY_MODE,
    decisionPolicyVersion:
      session?.decisionPolicyVersion?.trim() || DEFAULT_DECISION_POLICY_VERSION,
    decisionModel: session?.decisionModel?.trim() || null,
  };
}

export function isLongTaskSession(
  policy: Pick<AgentSessionPolicy, "sessionKind" | "autonomyMode">
): boolean {
  return (
    policy.sessionKind === "long_task" || policy.autonomyMode === "unattended"
  );
}

export function buildSessionPolicySystemPrompt(
  session: Pick<
    SessionRecord,
    "sessionKind" | "autonomyMode" | "decisionPolicyVersion" | "decisionModel"
  > | null | undefined
): string | null {
  const policy = resolveAgentSessionPolicy(session);
  if (!isLongTaskSession(policy)) {
    return null;
  }

  return [
    "## Session execution policy",
    "- sessionKind: long_task",
    "- autonomyMode: unattended",
    `- decisionPolicyVersion: ${policy.decisionPolicyVersion}`,
    `- decisionModel: ${policy.decisionModel ?? "default"}`,
    "- This is a long-running unattended task session.",
    "- Prefer autonomous continuation over pausing whenever a safe, conservative, and reversible path exists.",
    "- Record assumptions explicitly and keep moving instead of asking the user low-risk continue/choose/confirm questions.",
    "- Do not pause solely for tool-level risk confirmation; continue unless you truly need user input.",
  ].join("\n");
}
