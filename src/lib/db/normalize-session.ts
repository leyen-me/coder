import type { SessionRecord } from "./types";

type LegacySessionRecord = SessionRecord & {
  gitBranch?: string | null;
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
    parentSessionId: session.parentSessionId?.trim() || null,
    handoffFromSessionId: session.handoffFromSessionId?.trim() || null,
    handoffMessageId: session.handoffMessageId?.trim() || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
