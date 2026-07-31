import { stripWindowsVerbatimPrefix } from "@/lib/path";
import { parseModelValue } from "@/lib/model-provider/resolve-provider-config";
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
  planFileName?: string | null;
  planBuiltAt?: number | null;
  contextUsageSnapshot?: SessionRecord["contextUsageSnapshot"];
  pinnedAt?: number | null;
  attachedMcpServers?: string[] | null;
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
    workspaceDir: session.workspaceDir
      ? stripWindowsVerbatimPrefix(session.workspaceDir.trim()) || null
      : null,
    sessionKind:
      session.sessionKind === "long_task"
        ? "long_task"
        : DEFAULT_SESSION_KIND,
    autonomyMode:
      session.autonomyMode === "unattended"
        ? "unattended"
        : DEFAULT_SESSION_AUTONOMY_MODE,
    decisionPolicyVersion:
      session.decisionPolicyVersion?.trim() || DEFAULT_DECISION_POLICY_VERSION,
    decisionModel: session.decisionModel?.trim() || null,
    parentSessionId: session.parentSessionId?.trim() || null,
    planFileName: session.planFileName?.trim() || null,
    planBuiltAt: session.planBuiltAt ?? null,
    contextUsageSnapshot: normalizeContextUsageSnapshot(
      session.contextUsageSnapshot
    ),
    pinnedAt: session.pinnedAt ?? null,
    attachedMcpServers: session.attachedMcpServers ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function normalizeContextUsageSnapshot(
  snapshot: LegacySessionRecord["contextUsageSnapshot"]
): SessionRecord["contextUsageSnapshot"] {
  if (!snapshot) {
    return null;
  }

  const usedTokens = toNonNegativeInteger(snapshot.usedTokens);
  const maxTokens = toNonNegativeInteger(snapshot.maxTokens);
  const remainingTokens = toNonNegativeInteger(snapshot.remainingTokens);
  const reservedTokens = toNonNegativeInteger(snapshot.reservedTokens);
  const triggerThreshold =
    typeof snapshot.triggerThreshold === "number" &&
    Number.isFinite(snapshot.triggerThreshold)
      ? snapshot.triggerThreshold
      : null;
  const updatedAt = toNonNegativeInteger(snapshot.updatedAt);

  if (
    usedTokens === null ||
    maxTokens === null ||
    remainingTokens === null ||
    reservedTokens === null ||
    triggerThreshold === null ||
    updatedAt === null
  ) {
    return null;
  }

  return {
    usedTokens,
    maxTokens,
    remainingTokens,
    reservedTokens,
    triggerThreshold,
    source: "session",
    updatedAt,
  };
}

function toNonNegativeInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

/**
 * Infers the provider from a model ID when the stored provider is missing
 * (backward compatibility for records created before the provider field existed).
 */
export function inferProviderFromModel(
  storedProvider: string | null | undefined,
  modelValue: string
): string {
  if (storedProvider) {
    // Preserve whatever provider id was stored (a preset id or a custom id).
    // Unknown ids are kept as-is so they remain round-trippable.
    return storedProvider;
  }

  // A composite selection value `<providerId>::<modelId>` already carries the
  // provider; prefer it over inference.
  const { providerId, modelId } = parseModelValue(modelValue);
  if (providerId) {
    return providerId;
  }

  // Fall back to prefix-based inference for legacy records
  const model = modelId.toLowerCase();
  if (model.startsWith("deepseek")) return "deepseek";
  if (model.startsWith("glm")) return "glm";
  if (model.startsWith("agnes")) return "agnes";
  // Anything else is treated as a custom provider.
  return "custom";
}
