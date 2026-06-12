import { FolderTree, SquareTerminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRightPanel } from "@/features/right-panel/right-panel-context";
import { AgentProcessesToolbarButton } from "@/features/terminal/components/agent-processes-toolbar-button";
import { useBottomPanel } from "@/features/terminal/bottom-panel-context";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function SessionToolbar() {
  const { t } = useTranslation();
  const { isOpen, activeTab, toggleTab } = useBottomPanel();
  const isTerminalActive = isOpen && activeTab === "terminal";
  const {
    isOpen: isRightPanelOpen,
    toggleExplorer: toggleExplorerPanel,
  } = useRightPanel();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <AgentProcessesToolbarButton />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "text-muted-foreground",
              isTerminalActive && "bg-muted text-foreground"
            )}
            aria-label={t("session.terminal")}
            aria-pressed={isTerminalActive}
            onClick={() => toggleTab("terminal")}
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
            onClick={toggleExplorerPanel}
          >
            <FolderTree className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("rightPanel.explorer")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
