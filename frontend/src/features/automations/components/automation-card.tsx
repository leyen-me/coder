import { Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { getModelDisplayName } from "@/lib/model-provider/model-definition";
import { findModelEntry } from "@/lib/model-provider/resolve-provider-config";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { AutomationRunHistorySheet } from "./automation-run-history-sheet";
import { getNextCronOccurrenceAt } from "@/features/scheduled-jobs/lib/cron-expression";
import { resolveScheduledJobRunConfig } from "@/features/scheduled-jobs/lib/run-config";
import type { ScheduledJobViewModel } from "@/features/scheduled-jobs/lib/types";

type AutomationCardProps = {
  item: ScheduledJobViewModel;
  onToggle: (id: string, enabled: boolean) => void;
  onRun: (id: string) => void;
  onEdit: (item: ScheduledJobViewModel) => void;
  onDelete: (id: string) => void;
};

function formatCountdown(durationMs: number, t: ReturnType<typeof useTranslation>["t"]) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  if (totalSeconds < 1) {
    return t("automations.nextRunNow");
  }

  if (totalSeconds < 60) {
    return t("automations.countdownSeconds", { seconds: totalSeconds });
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return t("automations.countdownMinutesSeconds", {
      minutes: totalMinutes,
      seconds,
    });
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return t("automations.countdownHoursMinutes", {
      hours: totalHours,
      minutes,
    });
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return t("automations.countdownDaysHours", { days, hours });
}

export function AutomationCard({
  item,
  onToggle,
  onRun,
  onEdit,
  onDelete,
}: AutomationCardProps) {
  const { t } = useTranslation();
  const { modelEntries } = useModelProvider();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const runConfig = resolveScheduledJobRunConfig(item, modelEntries);
  const modelDefinition = findModelEntry(modelEntries, runConfig.model)?.model;
  const workspaceName = runConfig.workspaceDir
    ? getWorkspaceDisplayName(runConfig.workspaceDir)
    : null;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const nextRunAt = useMemo(() => {
    if (!item.enabled || item.running) {
      return null;
    }
    return getNextCronOccurrenceAt(item.cronExpression, nowMs);
  }, [item.cronExpression, item.enabled, item.running, nowMs]);

  const countdownText = useMemo(() => {
    if (item.running) {
      return t("automations.running");
    }
    if (!item.enabled) {
      return t("automations.nextRunPaused");
    }
    if (nextRunAt === null) {
      return t("automations.nextRunInvalid");
    }
    return t("automations.nextRunIn", {
      duration: formatCountdown(nextRunAt - nowMs, t),
    });
  }, [item.enabled, item.running, nextRunAt, nowMs, t]);

  return (
    <Card className={item.enabled ? undefined : "opacity-60"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{item.name}</CardTitle>
            {item.description ? (
              <CardDescription className="mt-1 line-clamp-2">
                {item.description}
              </CardDescription>
            ) : null}
          </div>
          <Switch
            checked={item.enabled}
            onCheckedChange={(checked) => onToggle(item.id, checked)}
            aria-label={
              item.enabled
                ? t("automations.disable")
                : t("automations.enable")
            }
          />
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {item.cronExpression}
            </code>
            <span className="text-xs">{countdownText}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>
              {modelDefinition
                ? getModelDisplayName(modelDefinition)
                : runConfig.model}
            </span>
            {workspaceName ? <span>{workspaceName}</span> : null}
            {runConfig.thinkingEnabled ? (
              <span>{t("automations.thinkingEnabledBadge")}</span>
            ) : null}
            {item.attachedMcpServers?.length ? (
              <span>
                {t("automations.mcpBadge", {
                  count: item.attachedMcpServers.length,
                })}
              </span>
            ) : null}
          </div>
          <p className="line-clamp-3 text-sm text-foreground/90">{item.prompt}</p>
        </div>
      </CardContent>

      <CardFooter className="flex-wrap justify-between gap-2 pt-0">
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="icon-sm"
                disabled={item.running}
                aria-label={
                  item.running
                    ? t("automations.running")
                    : t("automations.runNow")
                }
                onClick={() => onRun(item.id)}
              >
                {item.running ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {item.running ? t("automations.running") : t("automations.runNow")}
            </TooltipContent>
          </Tooltip>
          <AutomationRunHistorySheet
            automationName={item.name}
            runs={item.runs}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
            {t("automations.edit")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(item.id)}
          >
            {t("automations.delete")}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
