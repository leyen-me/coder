import { SPAWN_SUBAGENT_TOOL_NAME } from "./definitions";
import type { SubAgentOutput } from "./types";

export function getSubAgentChipLabel(
  toolName: string,
  _input: unknown,
  output: unknown,
): string | null {
  if (toolName !== SPAWN_SUBAGENT_TOOL_NAME) {
    return null;
  }

  const data = extractSubAgentOutput(output);
  if (!data) {
    return "spawn_subagent";
  }

  const taskPreview =
    data.task.length > 40
      ? `${data.task.slice(0, 40)}…`
      : data.task;

  const stepCount = data.steps.length;

  return `spawn_subagent: ${taskPreview} (${stepCount} steps)`;
}

export function extractSubAgentOutput(
  output: unknown,
): SubAgentOutput | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.task !== "string") {
    return null;
  }

  return {
    task: record.task,
    steps: Array.isArray(record.steps)
      ? (record.steps as SubAgentOutput["steps"])
      : [],
    summary: typeof record.summary === "string" ? record.summary : "",
    rounds: typeof record.rounds === "number" ? record.rounds : 0,
    toolCalls: typeof record.toolCalls === "number" ? record.toolCalls : 0,
    tokensUsed:
      typeof record.tokensUsed === "number" ? record.tokensUsed : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
