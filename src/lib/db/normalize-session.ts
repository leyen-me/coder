import {
  DEFAULT_DECISION_POLICY_VERSION,
  DEFAULT_SESSION_AUTONOMY_MODE,
  DEFAULT_SESSION_KIND,
  type SessionRecord,
} from "./types";

type LegacySessionRecord = {
  id: string;
  title: string;
  model: string;
  workspaceDir?: string | null;
  parentSessionId?: string | null;
  handoffFromSessionId?: string | null;
  handoffMessageId?: string | null;
  createdAt: number;
  updatedAt: number;
  gitBranch?: string | null;
  sessionKind?: SessionRecord["sessionKind"];
  autonomyMode?: SessionRecord["autonomyMode"];
  decisionPolicyVersion?: string;
  decisionModel?: string | null;
};

/** Ensures records written before workspace fields were added remain usable. */
export function normalizeSessionRecord(
  session: LegacySessionRecord
): SessionRecord {
  return {
    id: session.id,
    title: session.title,
    model: session.model,
    workspaceDir: session.workspaceDir?.trim() || null,
    sessionKind:
      session.sessionKind === "long_task" ? "long_task" : DEFAULT_SESSION_KIND,
    autonomyMode:
      session.autonomyMode === "unattended"
        ? "unattended"
        : DEFAULT_SESSION_AUTONOMY_MODE,
    decisionPolicyVersion:
      session.decisionPolicyVersion?.trim() || DEFAULT_DECISION_POLICY_VERSION,
    decisionModel: session.decisionModel?.trim() || null,
    parentSessionId: session.parentSessionId?.trim() || null,
    handoffFromSessionId: session.handoffFromSessionId?.trim() || null,
    handoffMessageId: session.handoffMessageId?.trim() || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
