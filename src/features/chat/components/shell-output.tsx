"use client";

import { useEffect, useMemo, useState } from "react";

import { extractShellData } from "@/features/agent/tools/shell-display";
import { stripAnsi } from "@/lib/strip-ansi";
import { cn } from "@/lib/utils";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  SquareIcon,
  XCircleIcon,
} from "lucide-react";

type ShellOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

function extractInputValue(
  input: unknown,
  key: string,
): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  return `…${path.slice(-(maxLen - 1))}`;
}

function truncateCommand(cmd: string, maxLen = 50): string {
  if (cmd.length <= maxLen) return cmd;
  return `${cmd.slice(0, maxLen - 1)}…`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ShellOutput({
  output,
  input,
  toolName,
  state,
  errorText,
  className,
}: ShellOutputProps) {
  // Live-update state: when a background shell finishes on the Rust side,
  // the component receives the final output via Tauri events.
  const [liveOutput, setLiveOutput] = useState<unknown | null>(null);
  // Streaming buffer: accumulates shell-output events before shell-finished.
  const [liveStreamBuffer, setLiveStreamBuffer] = useState("");
  // Track whether the user clicked stop.
  const [killing, setKilling] = useState(false);

  // Use the live event data when available, falling back to the stored output.
  const effectiveOutput = liveOutput ?? output;
  const data = effectiveOutput ? extractShellData(effectiveOutput) : null;

  const command =
    data?.command ?? extractInputValue(input, "command");
  const workingDirectory =
    data?.workingDirectory ?? extractInputValue(input, "working_directory");
  const description =
    data?.description ?? extractInputValue(input, "description");
  const status = data?.status;
  const exitCode = data?.exitCode;
  const durationMs = data?.durationMs;
  const shellId = data?.shellId;
  const stdout = data?.stdout ?? "";
  const stderr = data?.stderr ?? "";
  const stdoutTruncated = data?.stdoutTruncated ?? false;
  const stderrTruncated = data?.stderrTruncated ?? false;
  const stdoutTotalBytes = data?.stdoutTotalBytes ?? 0;
  const stderrTotalBytes = data?.stderrTotalBytes ?? 0;

  // Merge live streaming chunks into the display output.
  const displayStdout = liveOutput ? stdout : stdout + liveStreamBuffer;

  // Recovery effect: when the session is re-opened from IndexedDB, the persisted
  // output may have status === "running" because a background shell (block_until_ms=0)
  // finished after its result was already saved. The Rust-side ShellRegistry has
  // since been lost (app restart) or the shell has completed. Query the real status
  // from Rust, or infer it from the exit code when the shell is gone.
  useEffect(() => {
    if (liveOutput) return; // Already has live data — no recovery needed.
    if (status !== "running") return;
    if (!shellId || !isTauri()) return;

    let cancelled = false;

    void (async () => {
      try {
        const shells = await invoke<
          { shellId: string; status: string; exitCode?: number | null }[]
        >("shell_list", { statusFilter: "all" });
        if (cancelled) return;

        const found = shells.find((s) => s.shellId === shellId);
        if (found) {
          // Shell still exists in the registry — use its actual status.
          if (found.status !== "running") {
            setLiveOutput({
              ok: true,
              tool: "shell",
              data: { ...data, status: found.status, exitCode: found.exitCode ?? data?.exitCode },
            });
          }
        } else {
          // Shell registry has been cleared (e.g. app restart).
          // The process is gone — infer the final status from the exit code.
          const inferredStatus =
            data?.exitCode != null
              ? data.exitCode === 0
                ? "completed"
                : "failed"
              : "completed";
          setLiveOutput({
            ok: true,
            tool: "shell",
            data: { ...data, status: inferredStatus },
          });
        }
      } catch {
        // Best effort — if the query fails, keep the persisted state as-is.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [liveOutput, status, shellId]);

  // Subscribe to shell events for real-time updates.
  useEffect(() => {
    if (status !== "running" || !shellId || !isTauri()) return;

    let unlisteners: (() => void)[] = [];
    let cancelled = false;

    // Listen for streaming output chunks.
    listen<Record<string, unknown>>("shell-output", (event) => {
      if (cancelled) return;
      const payload = event.payload as Record<string, unknown>;
      if (payload.shellId !== shellId) return;
      const chunk = typeof payload.data === "string" ? payload.data : "";
      if (chunk) {
        setLiveStreamBuffer((prev) => prev + chunk);
      }
    }).then((unlisten) => {
      unlisteners.push(unlisten);
    });

    // Listen for shell completion (carries the full final ShellOutput).
    listen<Record<string, unknown>>("shell-finished", (event) => {
      if (cancelled) return;
      const payload = event.payload as Record<string, unknown>;
      if (payload.shellId !== shellId) return;
      // Wrap in the tool-result envelope so extractShellData can parse it.
      setLiveOutput({
        ok: true,
        tool: "shell",
        data: payload,
      });
    }).then((unlisten) => {
      unlisteners.push(unlisten);
    });

    return () => {
      cancelled = true;
      for (const fn of unlisteners) fn();
    };
  }, [status, shellId]);

  const formattedLog = useMemo(() => {
    const parts: string[] = [];

    // Command line
    if (command) {
      parts.push(`$ ${command}`);
    }

    // stdout (includes live streaming chunks when still running)
    if (displayStdout) {
      const cleaned = stripAnsi(displayStdout);
      if (cleaned) {
        parts.push(cleaned);
      }
    }

    // stderr
    if (stderr) {
      const cleaned = stripAnsi(stderr);
      if (cleaned) {
        parts.push(cleaned);
      }
    }

    // No output marker
    if (!displayStdout && !stderr) {
      const exitInfo =
        exitCode != null ? `exit code ${exitCode}` : null;
      parts.push(`(no output${exitInfo ? `, ${exitInfo}` : ""})`);
    }

    return parts.join("\n");
  }, [command, displayStdout, stderr, exitCode]);

  const showTruncated =
    (stdoutTruncated && stdoutTotalBytes > 0) ||
    (stderrTruncated && stderrTotalBytes > 0);

  const emptyOutput = !command && !displayStdout && !stderr;

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      {/* Header bar — two-line layout */}
      <div className="border-b bg-muted/30 px-3 py-2 text-xs">
        {/* Row 1: core info */}
        <div className="flex items-center gap-x-2">
          <ToolStatusIcon state={state} status={status} />

          <span className="font-mono font-medium text-foreground">
            {toolName}
          </span>

          {command ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span
                className="max-w-[240px] truncate font-mono font-medium text-foreground"
                title={command}
              >
                {truncateCommand(command)}
              </span>
            </>
          ) : null}

          <div className="ml-auto flex items-center gap-x-2">
            {/* Stop button for running shells */}
            {status === "running" && shellId && isTauri() ? (
              <button
                aria-label="Stop shell"
                className={cn(
                  "flex size-4 items-center justify-center rounded",
                  "text-muted-foreground/50 transition-colors hover:text-destructive",
                  killing && "pointer-events-none opacity-50",
                )}
                disabled={killing}
                onClick={(e) => {
                  e.stopPropagation();
                  setKilling(true);
                  invoke("shell_kill", { shellId }).then(
                    () => {
                      // Shell killed successfully — "shell-finished" event
                      // will update the UI. Re-enable button after 5s
                      // in case the event never arrives.
                      setTimeout(() => setKilling(false), 5000);
                    },
                    (error) => {
                      console.error("Failed to kill shell:", error);
                      setKilling(false);
                    },
                  );
                }}
                title="Stop"
                type="button"
              >
                <SquareIcon className="size-3" />
              </button>
            ) : null}

            {status ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium",
                  getStatusBadgeStyle(status),
                )}
              >
                {status}
              </span>
            ) : null}

            {exitCode != null ? (
              <span
                className={cn(
                  "font-mono font-medium",
                  exitCode === 0 ? "text-success" : "text-destructive",
                )}
              >
                exit {exitCode}
              </span>
            ) : null}
          </div>
        </div>

        {/* Row 2: secondary info */}
        {(description || workingDirectory || (durationMs != null && durationMs > 0)) ? (
          <div className="mt-0.5 flex items-center gap-x-2 pl-5">
            {description ? (
              <span className="font-mono text-muted-foreground/70">
                {description}
              </span>
            ) : null}

            {workingDirectory ? (
              <>
                {description ? (
                  <span className="text-muted-foreground/40">·</span>
                ) : null}
                <span className="font-mono text-muted-foreground/70">
                  {truncatePath(workingDirectory)}
                </span>
              </>
            ) : null}

            {durationMs != null && durationMs > 0 ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-mono text-muted-foreground/70">
                  {formatDuration(durationMs)}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Error banner */}
      {errorText ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <span className="min-w-0 whitespace-pre-wrap break-words">
            {errorText}
          </span>
        </div>
      ) : null}

      {/* Log body */}
      {emptyOutput ? (
        <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
          {state === "input-streaming" || state === "input-available"
            ? "Running…"
            : "No output"}
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <pre className="m-0 px-4 py-3 font-mono text-sm leading-relaxed text-foreground">
            <code>{formattedLog || "\n"}</code>
          </pre>
          {showTruncated ? (
            <p className="border-t px-3 py-2 text-muted-foreground text-xs">
              Output truncated (
              {stdoutTruncated && stdoutTotalBytes > 0
                ? `${(stdoutTotalBytes / 1024).toFixed(1)}KB stdout`
                : null}
              {stdoutTruncated && stderrTruncated ? ", " : ""}
              {stderrTruncated && stderrTotalBytes > 0
                ? `${(stderrTotalBytes / 1024).toFixed(1)}KB stderr`
                : null}
              )
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function getStatusBadgeStyle(status: string): string {
  switch (status) {
    case "completed":
      return "bg-success/10 text-success";
    case "running":
      return "bg-blue-500/10 text-blue-600";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "timeout":
      return "bg-amber-500/10 text-amber-600";
    case "cancelled":
      return "bg-muted-foreground/10 text-muted-foreground";
    default:
      return "bg-muted-foreground/10 text-muted-foreground";
  }
}

function ToolStatusIcon({
  state,
  status,
}: {
  state: ToolUIPart["state"];
  status?: string;
}) {
  // Running status overrides the generic streaming icon
  if (status === "running") {
    return (
      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-blue-600" />
    );
  }

  switch (state) {
    case "output-available":
      return status === "failed" || status === "timeout" || status === "cancelled" ? (
        <XCircleIcon className="size-3.5 shrink-0 text-destructive" />
      ) : (
        <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />
      );
    case "output-error":
      return <XCircleIcon className="size-3.5 shrink-0 text-destructive" />;
    case "input-streaming":
    case "input-available":
      return (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      );
    default:
      return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}
