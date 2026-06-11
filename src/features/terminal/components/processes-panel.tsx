"use client";

import {
  canKillShellProcess,
  getShellStatusBadgeVariant,
} from "@/features/agent/tools/shell-display";
import type { ShellStatus } from "@/features/agent/tools/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n/message-schema";
import { cn } from "@/lib/utils";
import { CpuIcon, SquareIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { ShellProcess } from "../use-shell-processes";
import { ProcessLogViewer } from "./process-log-viewer";

type ProcessesPanelProps = {
  processes: ShellProcess[];
  onKill: (shellId: string) => void;
  className?: string;
};

function getProcessStatusLabel(status: ShellStatus): MessageKey {
  return `terminal.processStatus.${status}`;
}

export function ProcessesPanel({
  processes,
  onKill,
  className,
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
      <Empty className={cn("h-full border-0", className)}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CpuIcon />
          </EmptyMedia>
          <EmptyTitle>{t("terminal.noProcesses")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0", className)}>
      <ScrollArea className="h-full w-52 shrink-0 border-r bg-muted/10">
        <div className="flex flex-col gap-1 p-2">
          {processes.map((process) => {
            const isSelected = selected?.shellId === process.shellId;
            const title =
              process.description ?? (process.command || process.shellId);
            const badgeVariant = getShellStatusBadgeVariant(process.status);

            return (
              <button
                key={process.shellId}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                  isSelected
                    ? "border-border/40 bg-muted/30 text-foreground/80"
                    : "border-transparent text-muted-foreground/70 hover:bg-muted/20"
                )}
                onClick={() => setSelectedId(process.shellId)}
                type="button"
              >
                <span className="line-clamp-2 text-xs leading-snug">{title}</span>
                <Badge
                  className={cn(
                    "h-4 w-fit px-1.5 text-[10px] font-normal",
                    process.status === "timeout" &&
                      "border-amber-500/40 text-amber-600 dark:text-amber-400"
                  )}
                  variant={badgeVariant}
                >
                  {t(getProcessStatusLabel(process.status))}
                </Badge>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {selected ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            <p
              className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
              title={selected.command || selected.shellId}
            >
              $ {selected.command || selected.shellId}
            </p>
            {canKillShellProcess(selected.status) ? (
              <Button
                className="h-7 shrink-0 gap-1.5 text-xs"
                onClick={() => onKill(selected.shellId)}
                size="sm"
                type="button"
                variant="destructive"
              >
                <SquareIcon className="size-3" />
                {t("terminal.killProcess")}
              </Button>
            ) : null}
          </div>
          <Separator />
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            <ProcessLogViewer
              className="h-full"
              stderr={selected.stderr}
              stdout={selected.stdout}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
