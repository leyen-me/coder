import { PanelBottom, PanelRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function SessionToolbar() {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("session.bottomPanel")}
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
