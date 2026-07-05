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
    `- sessionKind: ${policy.sessionKind}`,
    `- autonomyMode: ${policy.autonomyMode}`,
    `- decisionPolicyVersion: ${policy.decisionPolicyVersion}`,
    `- decisionModel: ${policy.decisionModel ?? "default"}`,
    "- This is a long-running unattended task session.",
    "- Work autonomously until the task is genuinely complete.",
    "- When your latest reply would normally hand control back to the user, a proxy agent will decide whether the task is complete or provide the next user-style continuation input.",
    "- Do not stop for low-risk follow-up questions when you can continue making progress yourself.",
  ].join("\n");
}
