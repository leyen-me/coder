"use client";

import { CpuIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useShellProcesses } from "../use-shell-processes";
import { ProcessesPanel } from "./processes-panel";

export function AgentProcessesSheet() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { processes, killProcess } = useShellProcesses();

  const runningCount = processes.filter(
    (process) => process.status === "running"
  ).length;

  const tooltip =
    runningCount > 0
      ? t("session.agentProcessesRunning", { count: runningCount })
      : t("session.agentProcesses");

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={tooltip}
            className={cn(
              "relative text-muted-foreground",
              open && "bg-muted text-foreground",
              runningCount > 0 && !open && "text-primary"
            )}
            onClick={() => setOpen(true)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <CpuIcon className="size-4" />
            {runningCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                {runningCount > 9 ? "9+" : runningCount}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-3xl">
          <SheetHeader className="shrink-0 border-b px-6 py-4">
            <SheetTitle>{t("terminal.agentProcesses")}</SheetTitle>
          </SheetHeader>
          <ProcessesPanel
            className="min-h-0 flex-1"
            onKill={(shellId) => {
              void killProcess(shellId);
            }}
            processes={processes}
            toolbarClassName="pr-12"
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
