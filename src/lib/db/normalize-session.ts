import type { ProviderId } from "@/lib/model-provider/types";
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
  provider?: string | null;
  workspaceDir?: string | null;
  parentSessionId?: string | null;
  handoffFromSessionId?: string | null;
  handoffMessageId?: string | null;
  planFileName?: string | null;
  planBuiltAt?: number | null;
  enableEmail?: boolean;
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
    provider: inferProviderFromModel(session.provider, session.model),
    workspaceDir: session.workspaceDir?.trim() || null,
    sessionKind:
      session.sessionKind === "long_task"
        ? "long_task"
        : session.sessionKind === "automation"
          ? "automation"
          : DEFAULT_SESSION_KIND,
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
    planFileName: session.planFileName?.trim() || null,
    planBuiltAt: session.planBuiltAt ?? null,
    enableEmail: session.enableEmail ?? undefined,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Infers the provider from a model ID when the stored provider is missing
 * (backward compatibility for records created before the provider field existed).
 */
export function inferProviderFromModel(
  storedProvider: string | null | undefined,
  modelId: string
): ProviderId {
  if (
    storedProvider &&
    storedProvider !== "deepseek" &&
    storedProvider !== "glm" &&
    storedProvider !== "agnes" &&
    storedProvider !== "minimax" &&
    storedProvider !== "nvidia" &&
    storedProvider !== "custom"
  ) {
    return "custom";
  }
  if (storedProvider) {
    return storedProvider as ProviderId;
  }

  // Fall back to prefix-based inference for legacy records
  const model = modelId.toLowerCase();
  if (model.startsWith("deepseek")) return "deepseek";
  if (model.startsWith("glm")) return "glm";
  if (model.startsWith("agnes")) return "agnes";
  return "custom";
}
