"use client";

import {
  canKillShellProcess,
  getShellStatusColor,
} from "@/features/agent/tools/shell-display";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { SquareIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { ShellProcess } from "../use-shell-processes";
import { ProcessLogViewer } from "./process-log-viewer";

type ProcessesPanelProps = {
  processes: ShellProcess[];
  onKill: (shellId: string) => void;
  className?: string;
  toolbarClassName?: string;
};

export function ProcessesPanel({
  processes,
  onKill,
  className,
  toolbarClassName,
}: ProcessesPanelProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(
    processes[0]?.shellId ?? null
  );

  useEffect(() => {
    if (processes.length === 0) {
      setSelectedId(null);
      return;
    }

    const stillSelected = processes.some(
      (process) => process.shellId === selectedId
    );
    if (!stillSelected) {
      setSelectedId(processes[0]?.shellId ?? null);
    }
  }, [processes, selectedId]);

  const selected =
    processes.find((process) => process.shellId === selectedId) ??
    processes[0] ??
    null;

  if (processes.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-muted-foreground",
          className
        )}
      >
        {t("terminal.noProcesses")}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 gap-3 p-3", className)}>
      <div className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto">
        {processes.map((process) => (
          <button
            key={process.shellId}
            className={cn(
              "rounded-md border px-2 py-1.5 text-left font-mono text-xs transition-colors",
              selected?.shellId === process.shellId
                ? "border-primary/50 bg-muted"
                : "border-transparent hover:bg-muted/50"
            )}
            onClick={() => setSelectedId(process.shellId)}
            type="button"
          >
            <div className="truncate">
              {process.description ?? (process.command || process.shellId)}
            </div>
            <div
              className={cn(
                "mt-0.5 truncate text-[10px]",
                getShellStatusColor(process.status)
              )}
            >
              {process.status}
            </div>
          </button>
        ))}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {selected ? (
          <>
            <div
              className={cn(
                "flex items-center justify-between gap-2",
                toolbarClassName
              )}
            >
              <p className="truncate font-mono text-xs text-muted-foreground">
                $ {selected.command || selected.shellId}
              </p>
              {canKillShellProcess(selected.status) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 text-xs"
                  onClick={() => onKill(selected.shellId)}
                  type="button"
                >
                  <SquareIcon className="size-3" />
                  {t("terminal.killProcess")}
                </Button>
              ) : null}
            </div>
            <ProcessLogViewer
              className="min-h-0 flex-1"
              stdout={selected.stdout}
              stderr={selected.stderr}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
