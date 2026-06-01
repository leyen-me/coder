import {
  ChevronDown,
  LayoutPanelLeft,
  PanelRight,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
            aria-label={t("session.fastMode")}
          >
            <Zap className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("session.fastMode")}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1 rounded-xl">
            {t("session.commit")}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>{t("session.exportSession")}</DropdownMenuItem>
          <DropdownMenuItem>{t("session.shareLink")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("session.splitLayout")}
          >
            <LayoutPanelLeft className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("session.splitLayout")}</TooltipContent>
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("session.workbench")}
          >
            <Sparkles className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("session.workbench")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
