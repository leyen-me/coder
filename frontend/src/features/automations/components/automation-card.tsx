import { BotIcon, FileQuestionIcon, Loader2, Play } from "lucide-react";

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
import {
  findModelDefinition,
  getModelDisplayName,
} from "@/lib/model-provider/model-definition";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { AutomationRunHistorySheet } from "./automation-run-history-sheet";
import { resolveAutomationRunConfig } from "../lib/run-config";
import type { AutomationViewModel } from "../lib/types";
import { getMinutesUntilNextRun } from "../lib/types";

type AutomationCardProps = {
  item: AutomationViewModel;
  onToggle: (id: string, enabled: boolean) => void;
  onRun: (id: string) => void;
  onEdit: (item: AutomationViewModel) => void;
  onDelete: (id: string) => void;
};

export function AutomationCard({
  item,
  onToggle,
  onRun,
  onEdit,
  onDelete,
}: AutomationCardProps) {
  const { t } = useTranslation();
  const { resolved } = useModelProvider();
  const runConfig = resolveAutomationRunConfig(item, resolved);
  const modelDefinition = findModelDefinition(resolved.models, runConfig.model);
  const workspaceName = runConfig.workspaceDir
    ? getWorkspaceDisplayName(runConfig.workspaceDir)
    : null;
  const nextRunMin = getMinutesUntilNextRun(item.cronExpression);
  const nextRunText = item.enabled && nextRunMin !== null
    ? nextRunMin < 60
      ? t("automations.nextRunInMinutes", { count: nextRunMin })
      : nextRunMin < 1440
        ? t("automations.nextRunInHours", { count: Math.round(nextRunMin / 60) })
        : t("automations.nextRunInDays", { count: Math.round(nextRunMin / 1440) })
    : null;

  return (
    <Card className={item.enabled ? undefined : "opacity-60"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{item.name}</CardTitle>
            {item.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {item.description}
              </CardDescription>
            )}
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
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Play className="h-3.5 w-3.5 shrink-0" />
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
              {item.cronExpression}
            </code>
            {item.enabled && nextRunText && <span className="text-xs">{nextRunText}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              {runConfig.agentMode === "agent" ? (
                <BotIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <FileQuestionIcon className="h-3.5 w-3.5 shrink-0" />
              )}
              {runConfig.agentMode === "agent"
                ? t("chat.modeAgent")
                : t("chat.modeAsk")}
            </span>
            <span>
              {modelDefinition
                ? getModelDisplayName(modelDefinition)
                : runConfig.model}
            </span>
            {workspaceName ? <span>{workspaceName}</span> : null}
            {runConfig.thinkingEnabled ? (
              <span>{t("automations.thinkingEnabledBadge")}</span>
            ) : null}
          </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(item)}
          >
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
