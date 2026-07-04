"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { extractShellData, mergeRecoveredShellData, preferLongerShellStream } from "@/features/agent/tools/shell-display";
import { stripAnsi } from "@/lib/strip-ansi";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api/client";
import { connectShellSse } from "@/lib/api/sse";
import type { ToolUIPart } from "ai";

import {
  CollapsibleToolSection,
} from "@/components/ai-elements/collapsible-tool-section";
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
  collapsible?: boolean;
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
  return `\u2026${path.slice(-(maxLen - 1))}`;
}

function truncateCommand(cmd: string, maxLen = 50): string {
  if (cmd.length <= maxLen) return cmd;
  return `${cmd.slice(0, maxLen - 1)}\u2026`;
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
  collapsible,
}: ShellOutputProps) {
  // Live-update state: when a background shell finishes on the Rust side,
  // the component receives the final output via Tauri events.
  const [liveOutput, setLiveOutput] = useState<unknown | null>(null);
  const [liveStdout, setLiveStdout] = useState("");
  const [liveStderr, setLiveStderr] = useState("");
  const liveStdoutRef = useRef("");
  const liveStderrRef = useRef("");
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
  const streamedStdout = `${stdout}${liveStdout}`;
  const streamedStderr = `${stderr}${liveStderr}`;
  const displayStdout = liveOutput
    ? preferLongerShellStream(stdout, streamedStdout)
    : streamedStdout;
  const displayStderr = liveOutput
    ? preferLongerShellStream(stderr, streamedStderr)
    : streamedStderr;

  useEffect(() => {
    liveStdoutRef.current = "";
    liveStderrRef.current = "";
    setLiveStdout("");
    setLiveStderr("");
  }, [shellId]);

  useEffect(() => {
    if (liveOutput) {
      return;
    }
    if (status !== "running" || !shellId) {
      return;
    }

    let cancelled = false;

    const refreshFinalOutput = async () => {
      try {
        const shells = await apiPost<
          {
            shellId: string;
            status: string;
            exitCode?: number | null;
            stdout?: string;
            stderr?: string;
          }[]
        >("/api/list_shells", { statusFilter: "all" });
        if (cancelled) {
          return;
        }

        const found = shells.find((shell) => shell.shellId === shellId);
        if (!found || found.status === "running") {
          return;
        }

        setLiveOutput({
          ok: true,
          tool: "shell",
          data: {
            ...data,
            status: found.status,
            exitCode: found.exitCode ?? data?.exitCode,
            stdout: preferLongerShellStream(
              found.stdout ?? data?.stdout,
              `${data?.stdout ?? ""}${liveStdoutRef.current}`
            ),
            stderr: preferLongerShellStream(
              found.stderr ?? data?.stderr,
              `${data?.stderr ?? ""}${liveStderrRef.current}`
            ),
          },
        });
        liveStdoutRef.current = "";
        liveStderrRef.current = "";
        setLiveStdout("");
        setLiveStderr("");
      } catch {
        // Best effort — keep streaming chunks visible if refresh fails.
      }
    };

    const unsubscribe = connectShellSse(
      shellId,
      (stream, chunk) => {
        if (cancelled) {
          return;
        }

        if (stream === "stderr") {
          liveStderrRef.current += chunk;
          setLiveStderr(liveStderrRef.current);
          return;
        }

        liveStdoutRef.current += chunk;
        setLiveStdout(liveStdoutRef.current);
      },
      () => {
        void refreshFinalOutput();
      },
      (error) => {
        console.warn(`[shell output] SSE error for ${shellId}: ${error}`);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [data, liveOutput, shellId, status]);

  // Recovery effect: when the session is re-opened from IndexedDB, the persisted
  // output may have status === "running" because a background shell (block_until_ms=0)
  // finished after its result was already saved. The Rust-side ShellRegistry has
  // since been lost (app restart) or the shell has completed. Query the real status
  // from Rust, or infer it from the exit code when the shell is gone.
  useEffect(() => {
    if (liveOutput) return; // Already has live data — no recovery needed.
    if (status !== "running") return;
    if (!shellId) return;

    let cancelled = false;

    void (async () => {
      try {
        const shells = await apiPost<
          {
            shellId: string;
            status: string;
            exitCode?: number | null;
            stdout?: string;
            stderr?: string;
          }[]
        >("/api/list_shells", { statusFilter: "all" });
        if (cancelled) return;

        const found = shells.find((s) => s.shellId === shellId);
        if (found) {
          // Shell still exists in the registry — use its actual status.
          if (found.status !== "running") {
            const recovered = mergeRecoveredShellData(data, found);
            if (recovered) {
              setLiveOutput({
                ok: true,
                tool: "shell",
                data: recovered,
              });
            }
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
    if (displayStderr) {
      const cleaned = stripAnsi(displayStderr);
      if (cleaned) {
        parts.push(cleaned);
      }
    }

    // No output marker
    if (!displayStdout && !displayStderr) {
      const exitInfo =
        exitCode != null ? `exit code ${exitCode}` : null;
      parts.push(`(no output${exitInfo ? `, ${exitInfo}` : ""})`);
    }

    return parts.join("\n");
  }, [command, displayStdout, displayStderr, exitCode]);

  const showTruncated =
    (stdoutTruncated && stdoutTotalBytes > 0) ||
    (stderrTruncated && stderrTotalBytes > 0);

  const emptyOutput = !command && !displayStdout && !displayStderr;

  const hasSecondaryRow = Boolean(description || workingDirectory || (durationMs != null && durationMs > 0));

  return (
    <CollapsibleToolSection
      className={className}
      collapsible={collapsible}
      errorText={errorText}
      defaultOpen={status === "running"}
      header={
        <div className="w-full">
          {/* Row 1: core info */}
          <div className="flex items-center gap-x-2">
            <ShellStatusIcon state={state} status={status} />

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
              {status === "running" && shellId ? (
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
                    apiPost("/api/kill_shell", { shellId }).then(
                      () => {
                        // Shell killed successfully.
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
          {hasSecondaryRow ? (
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
      }
    >
      {/* Log body */}
      {emptyOutput ? (
        <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
          {state === "input-streaming" || state === "input-available"
            ? "Running\u2026"
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
    </CollapsibleToolSection>
  );
}

/**
 * Shell-specific status icon that shows a blue spinner for running shells
 * (overrides the shared ToolStatusIcon's generic streaming icon).
 */
function ShellStatusIcon({
  state,
  status,
}: {
  state: ToolUIPart["state"];
  status?: string;
}) {
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
