import { PanelBottom } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProviderUsageTag } from "@/features/lab/provider-usage-tag";
import { useBottomPanel } from "@/features/terminal/bottom-panel-context";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { ProviderId } from "@/lib/model-provider/types";

type SessionToolbarProps = {
  sessionProvider?: ProviderId | null;
  sessionId?: string | null;
};

export function SessionToolbar({ sessionProvider, sessionId: _sessionId }: SessionToolbarProps) {
  const { t } = useTranslation();
  const { isOpen, toggle } = useBottomPanel();
  const isBottomActive = isOpen;

  const tooltip = t("session.bottomPanel");

  return (
    <div className="flex shrink-0 items-center gap-1">
      <ProviderUsageTag providerId={sessionProvider} />

      {sessionProvider === "deepseek" && <div className="mx-1 h-4 w-px bg-border" />}

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
    </div>
  );
}
