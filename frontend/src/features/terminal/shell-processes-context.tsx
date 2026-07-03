"use client";

import type { ShellInfo, ShellStatus } from "@/features/agent/tools/types";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ShellProcess = ShellInfo & {
  stdout: string;
  stderr: string;
};

type ShellOutputEvent = {
  shellId: string;
  stream: string;
  data: string;
};

type ShellFinishedEvent = {
  shellId: string;
  exitCode?: number;
  status: ShellStatus;
};

const EMPTY_PROCESSES: ShellProcess[] = [];

let processes: ShellProcess[] = [];
const subscribers = new Set<() => void>();
let storeInitialized = false;
let unlistenOutput: (() => void) | null = null;
let unlistenFinished: (() => void) | null = null;
let pollIntervalId: number | null = null;

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
  if (!isTauri()) {
    return;
  }

  try {
    const shells = await invoke<ShellInfo[]>("shell_list", {
      statusFilter: "running",
    });
    // Only expose human-terminal shells in the bottom panel.
    const humanShells = shells.filter(
      (shell) => shell.source !== "agent",
    );
    setProcesses((current) => mergeShellList(humanShells, current));
  } catch {
    // Ignore list failures in UI polling.
  }
}

async function initializeShellProcessStore(): Promise<void> {
  if (!isTauri() || storeInitialized) {
    return;
  }

  storeInitialized = true;

  unlistenOutput = await listen<ShellOutputEvent>("shell-output", (event) => {
    const { shellId, stream, data } = event.payload;
    setProcesses((current) => appendStream(current, shellId, stream, data));
  });

  unlistenFinished = await listen<ShellFinishedEvent>("shell-finished", (event) => {
    const { shellId, exitCode, status } = event.payload;
    setProcesses((current) =>
      updateFinished(current, shellId, status, exitCode)
    );
  });

  await refreshProcesses();

  if (pollIntervalId === null) {
    pollIntervalId = window.setInterval(() => {
      void refreshProcesses();
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
    unlistenOutput?.();
    unlistenFinished?.();
    unlistenOutput = null;
    unlistenFinished = null;
    storeInitialized = false;

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
    if (!isTauri()) {
      return;
    }

    await invoke("shell_kill", { shellId });
    setProcesses((current) =>
      current.map((process) =>
        process.shellId === shellId
          ? { ...process, status: "cancelled" as ShellStatus }
          : process
      )
    );
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

function updateFinished(
  current: ShellProcess[],
  shellId: string,
  status: ShellStatus,
  exitCode?: number
): ShellProcess[] {
  return current.map((process) =>
    process.shellId === shellId
      ? { ...process, status, exitCode }
      : process
  );
}
