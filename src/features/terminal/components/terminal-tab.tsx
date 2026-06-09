"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { useShellProcesses } from "../use-shell-processes";
import { InteractiveTerminal } from "./interactive-terminal";
import { ProcessesOverlay } from "./processes-overlay";

type TerminalTabProps = {
  workspaceDir: string | null;
};

type TerminalSession = {
  id: string;
  cwd: string;
};

export function TerminalTab({ workspaceDir }: TerminalTabProps) {
  const { t } = useTranslation();
  const { processes, killProcess } = useShellProcesses();
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeSession =
    sessions.find((session) => session.id === activeId) ?? sessions[0] ?? null;

  const handleNewTerminal = () => {
    if (!workspaceDir) {
      return;
    }

    const id = `term-${Date.now()}`;
    setSessions((current) => [...current, { id, cwd: workspaceDir }]);
    setActiveId(id);
  };

  const handleCloseSession = (sessionId: string) => {
    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) {
      return;
    }

    const nextSessions = sessions.filter((session) => session.id !== sessionId);
    setSessions(nextSessions);

    if (activeId === sessionId) {
      const fallback = nextSessions[index] ?? nextSessions[index - 1] ?? null;
      setActiveId(fallback?.id ?? null);
    }
  };

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("terminal.workspaceRequired")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={handleNewTerminal}
          type="button"
        >
          <PlusIcon className="size-3" />
          {t("terminal.newTerminal")}
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((session, index) => {
            const isActive = activeSession?.id === session.id;

            return (
              <div
                key={session.id}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center rounded-md border text-xs",
                  isActive
                    ? "border-border bg-muted text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/50"
                )}
              >
                <button
                  className="px-2 py-1 font-mono"
                  onClick={() => setActiveId(session.id)}
                  type="button"
                >
                  {t("terminal.sessionLabel")}
                  {sessions.length > 1 ? ` ${index + 1}` : ""}
                </button>
                <button
                  aria-label={t("terminal.closeSession")}
                  className="rounded-r-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => handleCloseSession(session.id)}
                  type="button"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            );
          })}
        </div>

        <ProcessesOverlay
          onKill={(shellId) => {
            void killProcess(shellId);
          }}
          processes={processes}
        />
      </div>

      <div className="relative min-h-0 flex-1 p-2">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("terminal.openTerminalHint")}
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
                isActive={activeSession?.id === session.id}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
