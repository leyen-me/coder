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
  if (!envelope) {
    return null;
  }

  // Prefer the tool_success envelope; also accept bare progressive payloads.
  const data =
    envelope.ok === true && asRecord(envelope.data)
      ? asRecord(envelope.data)
      : typeof envelope.task === "string"
        ? envelope
        : null;
  if (!data || typeof data.task !== "string") {
    return null;
  }

  return {
    task: data.task,
    steps: Array.isArray(data.steps)
      ? (data.steps as SubAgentOutput["steps"])
      : [],
    summary: typeof data.summary === "string" ? data.summary : "",
    rounds: typeof data.rounds === "number" ? data.rounds : 0,
    toolCalls: typeof data.toolCalls === "number" ? data.toolCalls : 0,
    tokensUsed:
      typeof data.tokensUsed === "number" ? data.tokensUsed : undefined,
    error: typeof data.error === "string" ? data.error : undefined,
    content: typeof data.content === "string" ? data.content : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
