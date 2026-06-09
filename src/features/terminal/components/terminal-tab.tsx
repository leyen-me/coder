"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { InteractiveTerminal } from "./interactive-terminal";

type TerminalTabProps = {
  workspaceDir: string | null;
};

type TerminalSession = {
  id: string;
  cwd: string;
};

export function TerminalTab({ workspaceDir }: TerminalTabProps) {
  const { t } = useTranslation();
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

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("terminal.workspaceRequired")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
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
        {sessions.map((session) => (
          <button
            key={session.id}
            className={
              activeSession?.id === session.id
                ? "rounded-md bg-muted px-2 py-1 font-mono text-xs"
                : "rounded-md px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted/50"
            }
            onClick={() => setActiveId(session.id)}
            type="button"
          >
            {t("terminal.sessionLabel")}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 p-2">
        {activeSession ? (
          <InteractiveTerminal
            key={activeSession.id}
            className="h-full w-full"
            cwd={activeSession.cwd}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("terminal.openTerminalHint")}
          </div>
        )}
      </div>
    </div>
  );
}
