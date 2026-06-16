"use client";

import { Minus, SquareTerminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useBottomPanel } from "../bottom-panel-context";
import { useShellProcesses } from "../use-shell-processes";
import { TerminalTab } from "./terminal-tab";

type BottomPanelProps = {
  workspaceDir: string | null;
};

export function BottomPanel({ workspaceDir }: BottomPanelProps) {
  const { t } = useTranslation();
  const { setOpen } = useBottomPanel();
  const { processes } = useShellProcesses();

  const runningCount = processes.filter(
    (process) => process.status === "running"
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col border-t bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <SquareTerminal className="size-3.5 shrink-0" />
          <span>{t("session.terminal")}</span>
          {runningCount > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
              {runningCount > 9 ? "9+" : runningCount}
            </span>
          ) : null}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t("terminal.hidePanel")}
              className="ml-auto size-7 shrink-0 text-muted-foreground"
              onClick={() => setOpen(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Minus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("terminal.hidePanel")}</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1">
        <TerminalTab workspaceDir={workspaceDir} />
      </div>
    </div>
  );
}
