import type { AgentToolCall } from "./tools/types";

/** Consecutive identical tool-call batches before treating the agent as stuck. */
export const TOOL_CALL_STALL_THRESHOLD = 3;

/**
 * Tool names that are exempt from stall detection.
 * These are polling/idempotent tools (e.g. await, read_shell_logs)
 * that agents naturally call repeatedly with the same arguments
 * while waiting for a long-running process to complete.
 */
export const POLL_TOOL_NAMES: ReadonlySet<string> = new Set([
  "await",
  "read_shell_logs",
]);

export function toolCallsSignature(toolCalls: AgentToolCall[]): string {
  return toolCalls
    .map((call) => `${call.name}:${call.arguments}`)
    .sort()
    .join("|");
}

export class ToolCallStallDetector {
  private consecutiveIdenticalRounds = 0;
  private lastSignature: string | null = null;

  constructor(
    private readonly threshold = TOOL_CALL_STALL_THRESHOLD,
    private readonly pollToolNames: ReadonlySet<string> = POLL_TOOL_NAMES
  ) {}

  /** Returns true when the same tool-call batch repeats too many times in a row. */
  record(toolCalls: AgentToolCall[]): boolean {
    if (toolCalls.length === 0) {
      this.consecutiveIdenticalRounds = 0;
      this.lastSignature = null;
      return false;
    }

    // Exclude polling tools from stall detection — agents legitimately
    // call them repeatedly (e.g. read_shell_logs, await) while waiting
    // for a long-running process to complete.
    const filteredCalls = toolCalls.filter(
      (call) => !this.pollToolNames.has(call.name)
    );

    if (filteredCalls.length === 0) {
      // All tools in this turn are polling tools — not a stall.
      this.consecutiveIdenticalRounds = 0;
      this.lastSignature = null;
      return false;
    }

    const signature = toolCallsSignature(filteredCalls);
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
