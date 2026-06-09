import { PanelBottom, PanelRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBottomPanel } from "@/features/terminal/bottom-panel-context";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function SessionToolbar() {
  const { t } = useTranslation();
  const { isOpen, toggle } = useBottomPanel();

  return (
    <div className="flex shrink-0 items-center gap-1">
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
            aria-label={t("session.bottomPanel")}
            aria-pressed={isOpen}
            onClick={toggle}
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
            className="text-muted-foreground"
            aria-label={t("session.rightPanel")}
          >
            <PanelRight className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("session.rightPanel")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
