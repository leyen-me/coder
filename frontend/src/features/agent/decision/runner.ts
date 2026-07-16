import type { DecisionResponse } from "@/lib/decision";

// Legacy parity oracle helpers kept for frontend/backend differential tests.
// Runtime proxy decision execution now lives exclusively in the backend.
export function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Decision model returned empty content");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Decision model did not return a JSON object");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

export function normalizeDecisionResponse(raw: unknown): DecisionResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("Decision response must be an object");
  }

  const value = raw as Record<string, unknown>;
  const outcome = value.outcome;
  const riskLevel = value.riskLevel;

  if (
    outcome !== "continue" &&
    outcome !== "complete" &&
    outcome !== "ask_user" &&
    outcome !== "stop_path"
  ) {
    throw new Error("Decision response has an invalid outcome");
  }

  if (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") {
    throw new Error("Decision response has an invalid risk level");
  }

  return {
    outcome,
    selectedOptionId:
      typeof value.selectedOptionId === "string" ? value.selectedOptionId : null,
    reason:
      typeof value.reason === "string" && value.reason.trim()
        ? value.reason.trim()
        : "No reason provided.",
    riskLevel,
    recordAsAssumption: value.recordAsAssumption === true,
    requiresUserConfirmation: value.requiresUserConfirmation === true,
    assumption:
      typeof value.assumption === "string" && value.assumption.trim()
        ? value.assumption.trim()
        : null,
    suggestedContinuation:
      typeof value.suggestedContinuation === "string" &&
      value.suggestedContinuation.trim()
        ? value.suggestedContinuation.trim()
        : null,
  };
}

