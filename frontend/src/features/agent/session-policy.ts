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
