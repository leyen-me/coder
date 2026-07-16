import type { MessageProcessStep } from "./types";

export function normalizeMessageProcessSteps(
  steps: MessageProcessStep[] | undefined
): MessageProcessStep[] {
  return (steps ?? [])
    .map((step) => normalizeMessageProcessStep(step))
    .filter((step): step is MessageProcessStep => step !== null);
}

function normalizeMessageProcessStep(
  step: MessageProcessStep
): MessageProcessStep | null {
  if (!step || typeof step !== "object") {
    return null;
  }

  const record = step as Record<string, unknown>;
  const id = readString(record, ["id"]);
  const kind = readString(record, ["kind"]);
  if (!id || !kind) {
    return null;
  }

  if (kind === "reasoning" || kind === "answer") {
    const text = readString(record, ["text"]) ?? "";
    return { id, kind, text };
  }

  if (kind === "tool") {
    const toolCallId = readString(record, ["toolCallId", "tool_call_id"]);
    if (!toolCallId) {
      return null;
    }
    return { id, kind, toolCallId };
  }

  if (kind === "decision") {
    const trigger = readString(record, ["trigger"]);
    const summary = readString(record, ["summary"]);
    const question = readString(record, ["question"]);
    const riskLevel = readString(record, ["riskLevel", "risk_level"]);
    const status = readString(record, ["status"]);
    const requiresUserConfirmation = readBoolean(record, [
      "requiresUserConfirmation",
      "requires_user_confirmation",
    ]);
    const options = Array.isArray(record.options) ? record.options : null;

    if (
      !trigger ||
      !summary ||
      !question ||
      !riskLevel ||
      !status ||
      requiresUserConfirmation === null ||
      !options
    ) {
      return null;
    }

    return {
      id,
      kind,
      trigger,
      summary,
      question,
      options,
      riskLevel,
      status,
      requiresUserConfirmation,
      response: (record.response as MessageProcessStep & { response?: unknown })
        .response as MessageProcessStep extends { response?: infer T } ? T : unknown,
    } as MessageProcessStep;
  }

  return null;
}

function readString(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

function readBoolean(
  record: Record<string, unknown>,
  keys: readonly string[]
): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}
