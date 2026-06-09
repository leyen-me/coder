import type { ShellInfo, ShellStatus } from "@/features/agent/tools/types";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

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

export function useShellProcesses() {
  const [processes, setProcesses] = useState<ShellProcess[]>([]);

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      return;
    }

    try {
      const shells = await invoke<ShellInfo[]>("shell_list");
      setProcesses((current) => mergeShellList(shells, current));
    } catch {
      // Ignore list failures in UI polling.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const unlisteners: Array<() => void> = [];

    void (async () => {
      const outputUnlisten = await listen<ShellOutputEvent>(
        "shell-output",
        (event) => {
          const { shellId, stream, data } = event.payload;
          setProcesses((current) =>
            appendStream(current, shellId, stream, data)
          );
        }
      );
      unlisteners.push(outputUnlisten);

      const finishedUnlisten = await listen<ShellFinishedEvent>(
        "shell-finished",
        (event) => {
          const { shellId, exitCode, status } = event.payload;
          setProcesses((current) =>
            updateFinished(current, shellId, status, exitCode)
          );
        }
      );
      unlisteners.push(finishedUnlisten);
    })();

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
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
    processes,
    refresh,
    killProcess,
  };
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
      stdout: existing?.stdout ?? "",
      stderr: existing?.stderr ?? "",
    };
  });
}

function appendStream(
  current: ShellProcess[],
  shellId: string,
  stream: string,
  data: string
): ShellProcess[] {
  const index = current.findIndex((process) => process.shellId === shellId);
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
