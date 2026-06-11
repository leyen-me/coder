"use client";

import { CpuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useBottomPanel } from "../bottom-panel-context";
import { useShellProcesses } from "../use-shell-processes";

export function AgentProcessesToolbarButton() {
  const { t } = useTranslation();
  const { isOpen, activeTab, toggleTab } = useBottomPanel();
  const { processes } = useShellProcesses();

  const runningCount = processes.filter(
    (process) => process.status === "running"
  ).length;

  const isActive = isOpen && activeTab === "processes";
  const tooltip =
    runningCount > 0
      ? t("session.agentProcessesRunning", { count: runningCount })
      : t("session.agentProcesses");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={tooltip}
          aria-pressed={isActive}
          className={cn(
            "relative text-muted-foreground",
            isActive && "bg-muted text-foreground",
            runningCount > 0 && !isActive && "text-primary"
          )}
          onClick={() => toggleTab("processes")}
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
  );
}
