const runningAutomations = new Set<string>();
const listeners = new Set<(running: ReadonlySet<string>) => void>();

function emitRunning(): void {
  const snapshot = new Set(runningAutomations);
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function isAutomationRunning(id: string): boolean {
  return runningAutomations.has(id);
}

export function getRunningAutomationIds(): ReadonlySet<string> {
  return new Set(runningAutomations);
}

export function subscribeAutomationRuns(
  listener: (running: ReadonlySet<string>) => void
): () => void {
  listeners.add(listener);
  listener(new Set(runningAutomations));
  return () => {
    listeners.delete(listener);
  };
}

export function tryAcquireAutomationRunLock(id: string): boolean {
  if (runningAutomations.has(id)) {
    return false;
  }

  runningAutomations.add(id);
  emitRunning();
  return true;
}

export function releaseAutomationRunLock(id: string): void {
  if (!runningAutomations.delete(id)) {
    return;
  }

  emitRunning();
}

/** Reset in-memory run locks — for tests only. */
export function resetAutomationRunLocksForTests(): void {
  runningAutomations.clear();
  emitRunning();
}
