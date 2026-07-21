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
  if (!data) {
    return null;
  }

  // All data is in __progress snapshot object: {task, steps, summary, rounds, ...}
  // data itself has {handleId, status, __progress}
  const snapshot = asRecord(data.__progress);
  if (!snapshot) return null;

  const task = typeof snapshot.task === "string" ? snapshot.task.trim() : "";
  const steps = Array.isArray(snapshot.steps)
    ? (snapshot.steps as SubAgentOutput["steps"])
    : [];
  const summary = typeof snapshot.summary === "string" ? snapshot.summary : "";
  const rounds = typeof snapshot.rounds === "number" ? snapshot.rounds : 0;
  const toolCalls = typeof snapshot.toolCalls === "number" ? snapshot.toolCalls : 0;
  const tokensUsed = typeof snapshot.tokensUsed === "number" ? snapshot.tokensUsed : undefined;
  const error = typeof data.error === "string" ? data.error : undefined;
  const content = typeof snapshot.content === "string" ? snapshot.content : undefined;

  if (task) {
    // Sub-agent has completed or has enough context to show final view.
    return { task, steps, summary, rounds, toolCalls, tokensUsed, error, content };
  }

  // Sub-agent is still running or was paused — show progress steps only.
  return extractProgressOutput(data);
}

/**
 * Build a SubAgentOutput from an in-progress payload that only has __progress.
 * Used when the sub-agent was paused/interrupted before producing a final result.
 */
function extractProgressOutput(
  data: Record<string, unknown>,
): SubAgentOutput {
  const snapshot = asRecord(data.__progress);
  const progress: unknown[] = Array.isArray(snapshot?.steps)
    ? snapshot.steps
    : [];
  const steps: SubAgentOutput["steps"] = progress.map((item) => {
    const record = asRecord(item);
    if (!record) {
      return { kind: "reasoning", text: String(item), state: "running" };
    }
    // The __progress array contains AgentEvent-like objects from
    // collect_subagent_event, e.g. {kind:"reasoning", text:"..."}
    // or {kind:"tool", toolName:"...", state:"completed", ...}.
    const kind = record.kind === "tool" ? ("tool" as const) : ("reasoning" as const);
    const text = typeof record.text === "string" ? record.text
      : typeof record.step === "string" ? record.step
      : String(item);
    const state =
      record.state === "completed"
        ? ("completed" as const)
        : record.state === "error"
          ? ("error" as const)
          : ("running" as const);
    return {
      kind,
      text,
      state,
      toolName: typeof record.toolName === "string" ? record.toolName : undefined,
      toolLabel: typeof record.toolLabel === "string" ? record.toolLabel : undefined,
    };
  });

  return {
    task: "",
    steps,
    summary: "",
    rounds: 0,
    toolCalls: 0,
    tokensUsed: undefined,
    error: undefined,
    content: undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
