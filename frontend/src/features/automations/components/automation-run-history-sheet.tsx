import { FolderOpen, History, Loader2, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { ScheduledJobRunRecord } from "@/features/scheduled-jobs/lib/types";
import { cn } from "@/lib/utils";

import { AutomationRunList } from "./automation-run-list";

type FilterTab = ScheduledJobRunRecord["status"] | "all";

type AutomationRunHistorySheetProps = {
  automationName: string;
  runs: ScheduledJobRunRecord[];
};

const FILTER_TABS: FilterTab[] = [
  "all",
  "completed",
  "failed",
  "running",
  "cancelled",
];

export function AutomationRunHistorySheet({
  automationName,
  runs,
}: AutomationRunHistorySheetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  const runningCount = useMemo(
    () => runs.filter((run) => run.status === "running").length,
    [runs]
  );

  const counts = useMemo(() => {
    const result: Record<FilterTab, number> = {
      all: runs.length,
      completed: 0,
      failed: 0,
      running: 0,
      cancelled: 0,
    };
    for (const run of runs) {
      result[run.status] += 1;
    }
    return result;
  }, [runs]);

  const filteredRuns = useMemo(() => {
    let result = runs;
    if (filter !== "all") {
      result = result.filter((run) => run.status === filter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(
        (run) =>
          run.summary.toLowerCase().includes(query) ||
          run.sessionId.toLowerCase().includes(query)
      );
    }
    return result;
  }, [filter, runs, searchQuery]);

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      const value = event.target.value;
      debounceRef.current = window.setTimeout(() => {
        setSearchQuery(value);
      }, 200);
    },
    []
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      window.setTimeout(() => {
        setFilter("all");
        setSearchQuery("");
        if (searchRef.current) {
          searchRef.current.value = "";
        }
      }, 200);
    }
  }, []);

  const isFiltered = filter !== "all" || searchQuery.trim().length > 0;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={cn("relative", runningCount > 0 && "text-primary")}
            aria-label={t("automations.runHistory")}
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
        <TooltipContent>
          {runs.length > 0
            ? `${t("automations.runHistory")} (${runs.length})`
            : t("automations.runHistory")}
        </TooltipContent>
      </Tooltip>

      <Sheet onOpenChange={handleOpenChange} open={open}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-md">
          <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <History className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="flex items-baseline gap-1.5 text-base">
                  {t("automations.runHistory")}
                  <span className="text-sm font-normal text-muted-foreground/60">
                    ({runs.length})
                  </span>
                </SheetTitle>
                <p className="truncate text-xs text-muted-foreground/60">
                  {automationName}
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="shrink-0 border-b px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                ref={searchRef}
                type="text"
                placeholder={t("automations.runHistorySearch")}
                onChange={handleSearchChange}
                className="h-9 rounded-md bg-muted/50 pl-9 text-sm placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div className="shrink-0 border-b px-5 py-2.5">
            <div className="flex gap-1" role="tablist">
              {FILTER_TABS.map((tab) => {
                const isActive = filter === tab;
                const count = counts[tab];
                return (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={isActive}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => setFilter(tab)}
                  >
                    {tab === "all"
                      ? t("automations.runHistoryFilterAll")
                      : t(`automations.runStatus.${tab}`)}
                    <span
                      className={cn(
                        "tabular-nums",
                        isActive
                          ? "text-primary/60"
                          : "text-muted-foreground/50"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {filteredRuns.length > 0 ? (
              <AutomationRunList runs={filteredRuns} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FolderOpen className="mb-3 size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground/60">
                  {isFiltered
                    ? t("automations.runHistoryEmptyFilter")
                    : t("automations.runHistoryEmpty")}
                </p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t px-5 py-3">
            <p className="text-xs text-muted-foreground/50">
              {t("automations.runHistoryFooter", {
                count: filteredRuns.length,
              })}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
