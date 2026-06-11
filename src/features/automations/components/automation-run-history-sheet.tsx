import { History, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { AutomationRunRecord } from "@/lib/db";
import { cn } from "@/lib/utils";

import { AutomationRunList } from "./automation-run-list";

type AutomationRunHistorySheetProps = {
  automationName: string;
  runs: AutomationRunRecord[];
};

export function AutomationRunHistorySheet({
  automationName,
  runs,
}: AutomationRunHistorySheetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const runningCount = runs.filter((run) => run.status === "running").length;
  const tooltip =
    runs.length > 0
      ? `${t("automations.runHistory")} (${runs.length})`
      : t("automations.runHistory");

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={cn("relative", runningCount > 0 && "text-primary")}
            aria-label={tooltip}
            onClick={() => setOpen(true)}
          >
            {runningCount > 0 ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <History className="size-4" />
            )}
            {runs.length > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
                {runs.length > 9 ? "9+" : runs.length}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-md">
          <SheetHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <SheetTitle>{t("automations.runHistory")}</SheetTitle>
            <SheetDescription className="truncate">
              {automationName}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <AutomationRunList runs={runs} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
