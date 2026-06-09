"use client";

import { ActivityIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { ShellProcess } from "../use-shell-processes";
import { ProcessesPanel } from "./processes-panel";

type ProcessesOverlayProps = {
  processes: ShellProcess[];
  onKill: (shellId: string) => void;
};

export function ProcessesOverlay({ processes, onKill }: ProcessesOverlayProps) {
  const { t } = useTranslation();

  if (processes.length === 0) {
    return null;
  }

  const runningCount = processes.filter(
    (process) => process.status === "running"
  ).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "h-7 shrink-0 gap-1.5 px-2 text-xs",
            runningCount > 0 && "border-primary/40"
          )}
          size="sm"
          type="button"
          variant="outline"
        >
          <ActivityIcon
            className={cn(
              "size-3",
              runningCount > 0 && "text-primary"
            )}
          />
          {runningCount > 0
            ? t("terminal.runningCount", { count: runningCount })
            : t("terminal.agentProcesses")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex h-[min(420px,55vh)] w-[min(720px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden rounded-xl p-0"
        side="top"
        sideOffset={8}
      >
        <PopoverHeader className="border-b px-3 py-2">
          <PopoverTitle className="text-sm font-medium">
            {t("terminal.agentProcesses")}
          </PopoverTitle>
        </PopoverHeader>
        <ProcessesPanel
          className="min-h-0 flex-1"
          onKill={onKill}
          processes={processes}
        />
      </PopoverContent>
    </Popover>
  );
}
