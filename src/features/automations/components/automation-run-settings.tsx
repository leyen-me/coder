import {
  BotIcon,
  BrainIcon,
  FileQuestionIcon,
  FolderOpenIcon,
  XIcon,
} from "lucide-react";

import type { AgentMode } from "@/features/agent/types";
import { canToggleThinking } from "@/features/agent/thinking-preference";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  findModelDefinition,
  getModelDisplayName,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import { cn } from "@/lib/utils";

type AutomationRunSettingsProps = {
  workspaceDir: string | null;
  onWorkspaceDirChange: (workspaceDir: string | null) => void;
  agentMode: AgentMode;
  onAgentModeChange: (agentMode: AgentMode) => void;
  model: string;
  onModelChange: (model: string) => void;
  thinkingEnabled: boolean;
  onThinkingEnabledChange: (thinkingEnabled: boolean) => void;
  models: readonly ModelDefinition[];
  disabled?: boolean;
};

export function AutomationRunSettings({
  workspaceDir,
  onWorkspaceDirChange,
  agentMode,
  onAgentModeChange,
  model,
  onModelChange,
  thinkingEnabled,
  onThinkingEnabledChange,
  models,
  disabled = false,
}: AutomationRunSettingsProps) {
  const { t } = useTranslation();
  const { pickWorkspace } = useWorkspace();
  const selectedModel = findModelDefinition(models, model);
  const showThinkingToggle = canToggleThinking(selectedModel);
  const workspaceName = workspaceDir
    ? getWorkspaceDisplayName(workspaceDir)
    : null;

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 p-4">
      <div>
        <p className="text-sm font-medium">{t("automations.fieldRunSettings")}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("automations.fieldRunSettingsHint")}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t("automations.fieldWorkspace")}</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 min-w-0 flex-1 justify-start gap-2 px-3"
            disabled={disabled}
            onClick={() => {
              void (async () => {
                const selected = await pickWorkspace();
                if (selected) {
                  onWorkspaceDirChange(selected);
                }
              })();
            }}
          >
            <FolderOpenIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {workspaceName ?? t("chat.localWork")}
            </span>
          </Button>
          {workspaceDir ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              disabled={disabled}
              aria-label={t("chat.clearWorkspace")}
              onClick={() => onWorkspaceDirChange(null)}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="automation-agent-mode">
            {t("automations.fieldAgentMode")}
          </Label>
          <Select
            value={agentMode}
            onValueChange={(value) => onAgentModeChange(value as AgentMode)}
            disabled={disabled}
          >
            <SelectTrigger id="automation-agent-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">
                <span className="inline-flex items-center gap-2">
                  <BotIcon className="h-4 w-4" />
                  {t("chat.modeAgent")}
                </span>
              </SelectItem>
              <SelectItem value="ask">
                <span className="inline-flex items-center gap-2">
                  <FileQuestionIcon className="h-4 w-4" />
                  {t("chat.modeAsk")}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="automation-model">{t("automations.fieldModel")}</Label>
          <Select
            value={model}
            onValueChange={onModelChange}
            disabled={disabled || models.length === 0}
          >
            <SelectTrigger id="automation-model" className="w-full">
              <SelectValue
                placeholder={t("chat.noModel")}
              />
            </SelectTrigger>
            <SelectContent>
              {models.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {getModelDisplayName(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showThinkingToggle ? (
        <div className="space-y-2">
          <Label>{t("automations.fieldThinking")}</Label>
          <Toggle
            pressed={thinkingEnabled}
            onPressedChange={onThinkingEnabledChange}
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-start gap-2 px-3",
              thinkingEnabled && "border-primary/40 bg-primary/5"
            )}
            aria-label={t("chat.thinkingToggle")}
          >
            <BrainIcon className="h-4 w-4 shrink-0" />
            <span>
              {thinkingEnabled
                ? t("chat.thinkingEnabled")
                : t("chat.thinkingDisabled")}
            </span>
          </Toggle>
        </div>
      ) : null}
    </div>
  );
}
