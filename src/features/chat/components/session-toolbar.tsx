import { FolderTree, SquareTerminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRightPanel } from "@/features/right-panel/right-panel-context";
import { AgentProcessesSheet } from "@/features/terminal/components/agent-processes-sheet";
import { useBottomPanel } from "@/features/terminal/bottom-panel-context";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function SessionToolbar() {
  const { t } = useTranslation();
  const { isOpen, toggle } = useBottomPanel();
  const { isOpen: isRightPanelOpen, toggle: toggleRightPanel } = useRightPanel();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <AgentProcessesSheet />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "text-muted-foreground",
              isOpen && "bg-muted text-foreground"
            )}
            aria-label={t("session.terminal")}
            aria-pressed={isOpen}
            onClick={toggle}
          >
            <SquareTerminal className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("session.terminal")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "text-muted-foreground",
              isRightPanelOpen && "bg-muted text-foreground"
            )}
            aria-label={t("rightPanel.explorer")}
            aria-pressed={isRightPanelOpen}
            onClick={toggleRightPanel}
          >
            <FolderTree className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("rightPanel.explorer")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
