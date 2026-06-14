import { PanelBottom, PanelRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRightPanel } from "@/features/right-panel/right-panel-context";
import { AgentProcessesToolbarButton } from "@/features/terminal/components/agent-processes-toolbar-button";
import { UpdateTag } from "@/features/update/update-tag";
import { useBottomPanel } from "@/features/terminal/bottom-panel-context";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function SessionToolbar() {
  const { t } = useTranslation();
  const { isOpen, toggleTab } = useBottomPanel();
  const isBottomActive = isOpen;
  const {
    isOpen: isRightPanelOpen,
    toggleExplorer: toggleExplorerPanel,
  } = useRightPanel();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <UpdateTag />
      <AgentProcessesToolbarButton />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "text-muted-foreground",
              isBottomActive && "bg-muted text-foreground"
            )}
            aria-label={t("session.bottomPanel")}
            aria-pressed={isBottomActive}
            onClick={() => toggleTab("terminal")}
          >
            <PanelBottom className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("session.bottomPanel")}</TooltipContent>
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
            aria-label={t("rightPanel.panel")}
            aria-pressed={isRightPanelOpen}
            onClick={toggleExplorerPanel}
          >
            <PanelRight className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("rightPanel.panel")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
