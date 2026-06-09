export const AGENT_CANCELLATION_MESSAGE = "Agent execution cancelled";

export class AgentCancellationError extends Error {
  readonly taskId?: string;

  constructor(taskId?: string, message = AGENT_CANCELLATION_MESSAGE) {
    super(message);
    this.name = "AgentCancellationError";
    this.taskId = taskId;
  }
}

export function isAgentCancellationError(
  error: unknown
): error is AgentCancellationError {
  return (
    error instanceof AgentCancellationError ||
    (error instanceof Error && error.name === "AgentCancellationError")
  );
}

export function throwIfAborted(signal?: AbortSignal, taskId?: string): void {
  if (signal?.aborted) {
    throw new AgentCancellationError(taskId);
  }
}
