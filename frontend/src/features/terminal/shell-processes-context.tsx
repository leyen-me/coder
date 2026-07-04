"use client";

import { apiPost } from "@/lib/api/client";
import { connectShellSse } from "@/lib/api/sse";
import type { ShellInfo } from "@/features/agent/tools/types";
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ShellProcess = ShellInfo & {
  stdout: string;
  stderr: string;
};

const EMPTY_PROCESSES: ShellProcess[] = [];

let processes: ShellProcess[] = [];
const subscribers = new Set<() => void>();
let storeInitialized = false;
let pollIntervalId: number | null = null;
const shellSubscriptions = new Map<string, () => void>();

function emitChange() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

function setProcesses(
  updater: (current: ShellProcess[]) => ShellProcess[]
): void {
  processes = updater(processes);
  emitChange();
}

function getProcessesSnapshot(): ShellProcess[] {
  return processes;
}

async function refreshProcesses(): Promise<void> {
  const shells = await apiPost<ShellInfo[]>("/api/shell_list", {
    statusFilter: "all",
  });
  setProcesses((current) => mergeShellList(shells, current));
  syncShellSubscriptions(shells);
}

async function initializeShellProcessStore(): Promise<void> {
  if (storeInitialized) {
    return;
  }

  storeInitialized = true;

  // Shell process events are handled by the server in browser mode.
  await refreshProcesses();

  if (pollIntervalId === null) {
    pollIntervalId = window.setInterval(() => {
      void refreshProcesses().catch((error: unknown) => {
        console.warn("[shell store] Failed to refresh shell processes", error);
      });
    }, 2000);
  }
}

function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  void initializeShellProcessStore();

  return () => {
    subscribers.delete(onStoreChange);
  };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    storeInitialized = false;
    clearShellSubscriptions();

    if (pollIntervalId !== null) {
      window.clearInterval(pollIntervalId);
      pollIntervalId = null;
    }

    processes = [];
    subscribers.clear();
  });
}

/** Starts shell listeners at app boot so logs survive bottom-panel toggles. */
export function ShellProcessesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    void initializeShellProcessStore();
  }, []);

  return children;
}

export function useShellProcesses() {
  const processList = useSyncExternalStore(
    subscribe,
    getProcessesSnapshot,
    getEmptySnapshot
  );

  const refresh = useCallback(async () => {
    await refreshProcesses();
  }, []);

  const killProcess = useCallback(async (shellId: string) => {
    await apiPost("/api/shell_kill", { shellId });
    await refreshProcesses();
  }, []);

  return {
    processes: processList,
    refresh,
    killProcess,
  };
}

function getEmptySnapshot(): ShellProcess[] {
  return EMPTY_PROCESSES;
}

function mergeShellList(
  shells: ShellInfo[],
  current: ShellProcess[]
): ShellProcess[] {
  const currentById = new Map(current.map((item) => [item.shellId, item]));

  return shells.map((shell) => {
    const existing = currentById.get(shell.shellId);
    return {
      ...shell,
      stdout: preferLongerStream(existing?.stdout, shell.stdout),
      stderr: preferLongerStream(existing?.stderr, shell.stderr),
    };
  });
}

function preferLongerStream(
  local: string | undefined,
  remote: string | undefined
): string {
  const localValue = local ?? "";
  const remoteValue = remote ?? "";
  return localValue.length >= remoteValue.length ? localValue : remoteValue;
}

function appendStream(
  current: ShellProcess[],
  shellId: string,
  stream: string,
  data: string
): ShellProcess[] {
  const index = current.findIndex((process) => process.shellId === shellId);

  // Skip agent shells — they are managed inline in the chat, not in the bottom panel.
  if (index === -1 && shellId.startsWith("pty-") === false) {
    return current;
  }

  if (index === -1) {
    return [
      ...current,
      {
        shellId,
        command: "",
        workingDirectory: "",
        status: "running",
        startedAtMs: 0,
        stdout: stream === "stdout" ? data : "",
        stderr: stream === "stderr" ? data : "",
        source: shellId.startsWith("pty-") ? "human" : "agent",
      },
    ];
  }

  return current.map((process, processIndex) => {
    if (processIndex !== index) {
      return process;
    }

    if (stream === "stderr") {
      return { ...process, stderr: process.stderr + data };
    }

    return { ...process, stdout: process.stdout + data };
  });
}

function syncShellSubscriptions(shells: ShellInfo[]) {
  const runningShellIds = new Set(
    shells.filter((shell) => shell.status === "running").map((shell) => shell.shellId)
  );

  for (const [shellId, unsubscribe] of shellSubscriptions) {
    if (!runningShellIds.has(shellId)) {
      unsubscribe();
      shellSubscriptions.delete(shellId);
    }
  }

  for (const shell of shells) {
    if (shell.status !== "running" || shellSubscriptions.has(shell.shellId)) {
      continue;
    }

    const unsubscribe = connectShellSse(
      shell.shellId,
      (stream, data) => {
        setProcesses((current) => appendStream(current, shell.shellId, stream, data));
      },
      () => {
        shellSubscriptions.delete(shell.shellId);
        void refreshProcesses().catch((error: unknown) => {
          console.warn("[shell store] Failed to refresh after SSE completion", error);
        });
      },
      (error) => {
        console.warn(`[shell store] SSE error for ${shell.shellId}: ${error}`);
      }
    );

    shellSubscriptions.set(shell.shellId, unsubscribe);
  }
}

function clearShellSubscriptions() {
  for (const unsubscribe of shellSubscriptions.values()) {
    unsubscribe();
  }
  shellSubscriptions.clear();
}
