"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import {
  CpuIcon,
  Minus,
  PlusIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { getShellStatusBadgeVariant } from "@/features/agent/tools/shell-display";
import { formatTerminalTabPath } from "../format-terminal-tab-path";
import { useBottomPanel } from "../bottom-panel-context";
import { resolveHomeDirectory, resolveTerminalCwd } from "../resolve-terminal-cwd";
import { useShellProcesses, type ShellProcess } from "../use-shell-processes";
import { InteractiveTerminal } from "./interactive-terminal";
import { ProcessLogViewer } from "./process-log-viewer";

type TerminalTabProps = {
  workspaceDir: string | null;
  onHide?: () => void;
};

type TerminalSession = {
  id: string;
  cwd: string;
  source: "human";
};

type AgentSession = {
  id: string;
  process: ShellProcess;
  source: "agent";
};

type UnifiedSession = TerminalSession | AgentSession;

function createTerminalSession(cwd: string): TerminalSession {
  return {
    id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cwd,
    source: "human",
  };
}

export function TerminalTab({ workspaceDir, onHide }: TerminalTabProps) {
  const { t } = useTranslation();
  const { isOpen: isBottomPanelOpen, setOpen: setBottomPanelOpen } =
    useBottomPanel();
  const { processes, killProcess } = useShellProcesses();
  const [homeDirectory, setHomeDirectory] = useState<string | null>(null);
  const [defaultCwd, setDefaultCwd] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Build unified session list: human sessions + agent processes (exclude human PTY entries)
  const unifiedSessions = useMemo<UnifiedSession[]>(
    () => [
      ...sessions,
      ...processes
        .filter((process) => process.source !== "human")
        .map(
          (process): AgentSession => ({
            id: process.shellId,
            process,
            source: "agent",
          })
        ),
    ],
    [processes, sessions]
  );

  const activeSession =
    unifiedSessions.find((session) => session.id === activeId) ??
    unifiedSessions[0] ??
    null;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const home = await resolveHomeDirectory();
      if (!cancelled) {
        setHomeDirectory(home);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cwd = await resolveTerminalCwd(workspaceDir);
      if (cancelled) {
        return;
      }

      setDefaultCwd(cwd);
      setInitError(cwd ? null : t("terminal.unavailable"));
    })();

    return () => {
      cancelled = true;
    };
  }, [t, workspaceDir]);

  useEffect(() => {
    if (!isBottomPanelOpen || !defaultCwd || sessions.length > 0) {
      return;
    }

    const session = createTerminalSession(defaultCwd);
    setSessions([session]);
    setActiveId(session.id);
  }, [defaultCwd, isBottomPanelOpen, sessions.length]);

  // Auto-select new agent processes if nothing else is selected
  useEffect(() => {
    if (unifiedSessions.length === 0) {
      setActiveId(null);
      return;
    }

    if (!activeId || !unifiedSessions.some((s) => s.id === activeId)) {
      setActiveId(unifiedSessions[0]?.id ?? null);
    }
  }, [unifiedSessions, activeId]);

  const handleNewTerminal = () => {
    if (!defaultCwd) {
      return;
    }

    const session = createTerminalSession(defaultCwd);
    setSessions((current) => [...current, session]);
    setActiveId(session.id);
  };

  const handleCloseSession = (sessionId: string) => {
    const session = unifiedSessions.find((s) => s.id === sessionId);
    if (!session) {
      return;
    }

    if (session.source === "human") {
      // Close human terminal
      const index = sessions.findIndex((s) => s.id === sessionId);
      if (index === -1) {
        return;
      }

      const nextSessions = sessions.filter((s) => s.id !== sessionId);

      if (nextSessions.length === 0) {
        setSessions([]);
        setActiveId(null);
        setBottomPanelOpen(false);
        return;
      }

      setSessions(nextSessions);

      if (activeId === sessionId) {
        const fallback =
          nextSessions[index] ?? nextSessions[index - 1] ?? null;
        setActiveId(fallback?.id ?? null);
      }
    } else if (session.source === "agent") {
      // Kill agent process
      void killProcess(sessionId);
    }
  };

  const renderSessionLabel = (session: UnifiedSession) => {
    if (session.source === "human") {
      const formatted = formatTerminalTabPath(session.cwd, homeDirectory);
      // Show only the last path component (directory name)
      return formatted.split("/").filter(Boolean).pop() ?? formatted;
    }
    return (
      session.process.description ??
      (session.process.command || session.process.shellId)
    );
  };

  const renderSessionTitle = (session: UnifiedSession): string | undefined => {
    if (session.source === "human") {
      return formatTerminalTabPath(session.cwd, homeDirectory);
    }
    return (
      session.process.description ??
      (session.process.command || session.process.shellId)
    );
  };

  const renderSessionIcon = (session: UnifiedSession) => {
    if (session.source === "human") {
      return <TerminalIcon className="size-3 shrink-0" />;
    }
    return <CpuIcon className="size-3 shrink-0" />;
  };

  const renderSessionBadge = (session: UnifiedSession) => {
    if (session.source === "human") {
      return null;
    }

    const badgeVariant = getShellStatusBadgeVariant(session.process.status);
    return (
      <Badge
        className={cn(
          "h-3.5 px-1 text-[9px] font-normal",
          session.process.status === "timeout" &&
            "border-amber-500/40 text-amber-600 dark:text-amber-400"
        )}
        variant={badgeVariant}
      >
        {t(`terminal.processStatus.${session.process.status}` as const)}
      </Badge>
    );
  };

  const noSessions = unifiedSessions.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {unifiedSessions.map((session) => {
            const isActive = activeSession?.id === session.id;
            const label = renderSessionLabel(session);
            const icon = renderSessionIcon(session);

            return (
              <div
                key={session.id}
                className={cn(
                  "group inline-flex h-7 shrink-0 items-center rounded-md border text-xs",
                  isActive
                    ? "border-border/40 bg-muted/30 text-foreground/80"
                    : "border-transparent text-muted-foreground/70 hover:bg-muted/20"
                )}
              >
                <button
                  aria-label={
                    session.source === "human"
                      ? t("terminal.closeSession")
                      : t("terminal.killProcess")
                  }
                  className="rounded-l-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
                  onClick={() => handleCloseSession(session.id)}
                  type="button"
                >
                  <span className="group-hover:hidden">{icon}</span>
                  <XIcon className="hidden size-3 group-hover:block" />
                </button>
                <button
                  className="flex min-w-0 items-center gap-1 px-2 py-1 font-mono"
                  onClick={() => setActiveId(session.id)}
                  title={renderSessionTitle(session)}
                  type="button"
                >
                  <span className="truncate">{label}</span>
                  {renderSessionBadge(session)}
                </button>
              </div>
            );
          })}

          <Button
            aria-label={t("terminal.addSession")}
            className="size-7 shrink-0 text-muted-foreground/60 hover:text-muted-foreground"
            disabled={!defaultCwd}
            onClick={handleNewTerminal}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-3.5" />
          </Button>
        </div>

        {onHide ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("terminal.hidePanel")}
                className="size-7 shrink-0 text-muted-foreground"
                onClick={onHide}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Minus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("terminal.hidePanel")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 p-2">
        {noSessions ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {initError ?? t("terminal.loading")}
          </div>
        ) : (
          unifiedSessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "absolute inset-2",
                activeSession?.id === session.id
                  ? "z-10 opacity-100"
                  : "pointer-events-none z-0 opacity-0"
              )}
            >
              {session.source === "human" ? (
                <InteractiveTerminal
                  className="h-full w-full"
                  cwd={session.cwd}
                  isActive={
                    isBottomPanelOpen && activeSession?.id === session.id
                  }
                />
              ) : (
                <ProcessLogViewer
                  className="h-full"
                  stdout={session.process.stdout}
                  stderr={session.process.stderr}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
