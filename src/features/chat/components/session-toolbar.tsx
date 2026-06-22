import { ExternalLink, PanelBottom, PanelRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRightPanel } from "@/features/right-panel/right-panel-context";
import { ProviderUsageTag } from "@/features/lab/provider-usage-tag";
import { useBottomPanel } from "@/features/terminal/bottom-panel-context";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { ProviderId } from "@/lib/model-provider/types";
import { invoke } from "@tauri-apps/api/core";

type SessionToolbarProps = {
  sessionProvider?: ProviderId | null;
};

export function SessionToolbar({ sessionProvider }: SessionToolbarProps) {
  const { t } = useTranslation();
  const { isOpen, toggle } = useBottomPanel();
  const isBottomActive = isOpen;
  const {
    isOpen: isRightPanelOpen,
    toggle: toggleRightPanel,
  } = useRightPanel();

  const tooltip = t("session.bottomPanel");

  const handleNewWindow = () => {
    invoke("create_new_window");
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <ProviderUsageTag providerId={sessionProvider} />

      <div className="mx-1 h-4 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("titleBar.newWindow")}
            onClick={handleNewWindow}
          >
            <ExternalLink className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("titleBar.newWindow")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "text-muted-foreground",
              isBottomActive && "bg-muted text-foreground",
            )}
            aria-label={tooltip}
            aria-pressed={isBottomActive}
            onClick={toggle}
          >
            <PanelBottom className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
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
            onClick={toggleRightPanel}
          >
            <PanelRight className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("rightPanel.panel")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
