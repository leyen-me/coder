import { BotIcon, ExternalLink, FileQuestionIcon, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { paths } from "@/app/paths";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  findModelDefinition,
  getModelDisplayName,
} from "@/lib/model-provider/model-definition";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { resolveAutomationRunConfig } from "../lib/run-config";
import type { AutomationViewModel } from "../lib/types";
import { getMinutesUntilNextRun } from "../lib/types";

type AutomationCardProps = {
  item: AutomationViewModel;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (item: AutomationViewModel) => void;
  onDelete: (id: string) => void;
};

export function AutomationCard({
  item,
  onToggle,
  onEdit,
  onDelete,
}: AutomationCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
          {item.lastRunAt && (
            <div className="flex items-center gap-2">
              <span className="text-xs">
                {t("automations.lastRun", {
                  time: new Date(item.lastRunAt).toLocaleString(),
                })}
              </span>
            </div>
          )}
          {item.lastResultSummary && (
            <p className="text-xs line-clamp-2 mt-1 border-l-2 border-muted-foreground/30 pl-3">
              {item.lastResultSummary}
            </p>
          )}
          {item.lastSessionId && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => navigate(paths.chat(item.lastSessionId!))}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              {t("automations.viewSession")}
            </Button>
          )}
        </div>
      </CardContent>

      <CardFooter className="gap-2 pt-0">
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
      </CardFooter>
    </Card>
  );
}
