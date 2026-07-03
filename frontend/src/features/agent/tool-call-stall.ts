import type { AgentToolCall } from "./tools/types";

/** Consecutive identical tool-call batches before treating the agent as stuck. */
export const TOOL_CALL_STALL_THRESHOLD = 3;

export function toolCallsSignature(toolCalls: AgentToolCall[]): string {
  return toolCalls
    .map((call) => `${call.name}:${call.arguments}`)
    .sort()
    .join("|");
}

export class ToolCallStallDetector {
  private consecutiveIdenticalRounds = 0;
  private lastSignature: string | null = null;

  constructor(private readonly threshold = TOOL_CALL_STALL_THRESHOLD) {}

  /** Returns true when the same tool-call batch repeats too many times in a row. */
  record(toolCalls: AgentToolCall[]): boolean {
    if (toolCalls.length === 0) {
      this.consecutiveIdenticalRounds = 0;
      this.lastSignature = null;
      return false;
    }

    const signature = toolCallsSignature(toolCalls);
    if (signature === this.lastSignature) {
      this.consecutiveIdenticalRounds += 1;
    } else {
      this.consecutiveIdenticalRounds = 1;
      this.lastSignature = signature;
    }

    return this.consecutiveIdenticalRounds >= this.threshold;
  }
}

export function agentToolCallStallError(): Error {
  return new Error(
    "Agent appears stuck repeating the same tool calls. Try rephrasing the task or providing more context."
  );
}
