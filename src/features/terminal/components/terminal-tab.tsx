"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { PlusIcon, TerminalIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { formatTerminalTabPath } from "../format-terminal-tab-path";
import { useBottomPanel } from "../bottom-panel-context";
import { resolveHomeDirectory, resolveTerminalCwd } from "../resolve-terminal-cwd";
import { InteractiveTerminal } from "./interactive-terminal";

type TerminalTabProps = {
  workspaceDir: string | null;
};

type TerminalSession = {
  id: string;
  cwd: string;
};

function createTerminalSession(cwd: string): TerminalSession {
  return {
    id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cwd,
  };
}

export function TerminalTab({ workspaceDir }: TerminalTabProps) {
  const { t } = useTranslation();
  const { isOpen: isBottomPanelOpen, activeTab, setOpen: setBottomPanelOpen } =
    useBottomPanel();
  const isTerminalTabActive =
    isBottomPanelOpen && activeTab === "terminal";
  const [homeDirectory, setHomeDirectory] = useState<string | null>(null);
  const [defaultCwd, setDefaultCwd] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const activeSession =
    sessions.find((session) => session.id === activeId) ?? sessions[0] ?? null;

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
    if (!isTerminalTabActive || !defaultCwd || sessions.length > 0) {
      return;
    }

    const session = createTerminalSession(defaultCwd);
    setSessions([session]);
    setActiveId(session.id);
  }, [defaultCwd, isTerminalTabActive, sessions.length]);

  const handleNewTerminal = () => {
    if (!defaultCwd) {
      return;
    }

    const session = createTerminalSession(defaultCwd);
    setSessions((current) => [...current, session]);
    setActiveId(session.id);
  };

  const handleCloseSession = (sessionId: string) => {
    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) {
      return;
    }

    const nextSessions = sessions.filter((session) => session.id !== sessionId);

    if (nextSessions.length === 0) {
      setSessions([]);
      setActiveId(null);
      setBottomPanelOpen(false);
      return;
    }

    setSessions(nextSessions);

    if (activeId === sessionId) {
      const fallback = nextSessions[index] ?? nextSessions[index - 1] ?? null;
      setActiveId(fallback?.id ?? null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((session) => {
            const isActive = activeSession?.id === session.id;
            const tabLabel = formatTerminalTabPath(session.cwd, homeDirectory);

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
                  aria-label={t("terminal.closeSession")}
                  className="rounded-l-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
                  onClick={() => handleCloseSession(session.id)}
                  type="button"
                >
                  <TerminalIcon className="size-3 group-hover:hidden" />
                  <XIcon className="hidden size-3 group-hover:block" />
                </button>
                <button
                  className="max-w-56 truncate px-2 py-1 font-mono"
                  onClick={() => setActiveId(session.id)}
                  title={session.cwd}
                  type="button"
                >
                  {tabLabel}
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
      </div>

      <div className="relative min-h-0 flex-1 p-2">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {initError ?? t("terminal.loading")}
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "absolute inset-2",
                activeSession?.id === session.id
                  ? "z-10 opacity-100"
                  : "pointer-events-none z-0 opacity-0"
              )}
            >
              <InteractiveTerminal
                className="h-full w-full"
                cwd={session.cwd}
                isActive={
                  isTerminalTabActive && activeSession?.id === session.id
                }
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
