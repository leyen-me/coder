/**
 * Track the latest applied SSE event seq per task.
 * Duplicate deliveries (raced resume/start connections) are dropped.
 */
export function shouldApplyAgentEventSeq(
  lastSeqByTask: Map<string, number>,
  taskId: string,
  seq: unknown,
): boolean {
  if (typeof seq !== "number" || !Number.isFinite(seq)) {
    // Heartbeats / legacy payloads without seq still flow through.
    return true;
  }

  const normalized = Math.trunc(seq);
  if (normalized <= 0) {
    return true;
  }

  const last = lastSeqByTask.get(taskId) ?? 0;
  if (normalized <= last) {
    return false;
  }

  lastSeqByTask.set(taskId, normalized);
  return true;
}

export function seedAgentEventSeq(
  lastSeqByTask: Map<string, number>,
  taskId: string,
  fromSeq: number | null | undefined,
): void {
  if (typeof fromSeq !== "number" || !Number.isFinite(fromSeq)) {
    lastSeqByTask.set(taskId, 0);
    return;
  }
  lastSeqByTask.set(taskId, Math.max(0, Math.trunc(fromSeq)));
}

export function clearAgentEventSeq(
  lastSeqByTask: Map<string, number>,
  taskId: string,
): void {
  lastSeqByTask.delete(taskId);
}

export function readAgentEventSeq(event: { seq?: unknown }): unknown {
  return event.seq;
}
