import {
  BotIcon,
  BrainIcon,
  ChevronDownIcon,
  FileQuestionIcon,
  FolderOpenIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { canToggleThinking } from "@/features/agent/thinking-preference";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { pickWorkspaceDir } from "@/features/workspace/pick-workspace-dir";
import {
  composerFooterControlActiveClassName,
  composerFooterControlClassName,
} from "@/components/ai-elements/composer-footer-control";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  findModelDefinition,
  getModelDisplayName,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import type { ProviderId } from "@/lib/model-provider/types";
import { cn } from "@/lib/utils";
import type { ScheduledJobAgentMode } from "@/features/scheduled-jobs/lib/api";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  glm: "GLM",
  agnes: "Agnes",
  nvidia: "NVIDIA",
  minimax: "MiniMax",
  custom: "Custom",
};

function renderModelOptions(
  models: readonly ModelDefinition[],
  modelProviders?: Map<string, ProviderId>
) {
  if (!modelProviders) {
    return models.map((item) => (
      <DropdownMenuRadioItem key={item.id} value={item.id}>
        {getModelDisplayName(item)}
      </DropdownMenuRadioItem>
    ));
  }

  const groups = new Map<ProviderId, ModelDefinition[]>();
  for (const model of models) {
    const provider = modelProviders.get(model.id) ?? "custom";
    const group = groups.get(provider);
    if (group) {
      group.push(model);
    } else {
      groups.set(provider, [model]);
    }
  }

  const items: ReactNode[] = [];
  let groupIndex = 0;
  for (const [providerId, providerModels] of groups) {
    if (groupIndex > 0) {
      items.push(<DropdownMenuSeparator key={`sep-${providerId}`} />);
    }
    items.push(
      <DropdownMenuGroup key={providerId}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {PROVIDER_LABELS[providerId] ?? providerId}
        </DropdownMenuLabel>
        {providerModels.map((item) => (
          <DropdownMenuRadioItem key={item.id} value={item.id}>
            {getModelDisplayName(item)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuGroup>
    );
    groupIndex += 1;
  }

  return items;
}

type AutomationRunSettingsProps = {
  workspaceDir: string | null;
  onWorkspaceDirChange: (workspaceDir: string | null) => void;
  agentMode: ScheduledJobAgentMode;
  onAgentModeChange: (agentMode: ScheduledJobAgentMode) => void;
  model: string;
  onModelChange: (model: string) => void;
  thinkingEnabled: boolean;
  onThinkingEnabledChange: (thinkingEnabled: boolean) => void;
  models: readonly ModelDefinition[];
  modelProviders?: Map<string, ProviderId>;
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
  modelProviders,
  disabled = false,
}: AutomationRunSettingsProps) {
  const { t } = useTranslation();
  const selectedModel = findModelDefinition(models, model);
  const showThinkingToggle = canToggleThinking(selectedModel);
  const workspaceName = workspaceDir
    ? getWorkspaceDisplayName(workspaceDir)
    : null;

  return (
    <div className="space-y-2.5 rounded-xl border border-border/70 p-3">
      <Label className="text-sm">{t("automations.fieldRunSettings")}</Label>

      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          className="h-8 min-w-0 flex-1 justify-start gap-1.5 rounded-xl px-2.5 text-sm font-medium"
          disabled={disabled}
          title={t("automations.fieldRunSettingsHint")}
          onClick={() => {
            void (async () => {
              const selected = await pickWorkspaceDir();
              if (selected) {
                onWorkspaceDirChange(selected);
              }
            })();
          }}
        >
          <FolderOpenIcon className="size-4 shrink-0" />
          <span className="truncate">
            {workspaceName ?? t("chat.localWork")}
          </span>
        </Button>
        {workspaceDir ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 rounded-xl"
            disabled={disabled}
            aria-label={t("chat.clearWorkspace")}
            onClick={() => onWorkspaceDirChange(null)}
          >
            <XIcon className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                composerFooterControlClassName,
                "inline-flex min-w-0 items-center gap-1.5",
                "data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:dark:bg-input/50"
              )}
              title={
                agentMode === "agent"
                  ? t("chat.modeAgentLabel")
                  : t("chat.modeAskLabel")
              }
            >
              {agentMode === "agent" ? (
                <BotIcon className="size-3.5 shrink-0" />
              ) : (
                <FileQuestionIcon className="size-3.5 shrink-0" />
              )}
              <span className="truncate">
                {agentMode === "agent"
                  ? t("chat.modeAgent")
                  : t("chat.modeAsk")}
              </span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-32">
            <DropdownMenuRadioGroup
              value={agentMode}
              onValueChange={(value) =>
                onAgentModeChange(value as ScheduledJobAgentMode)
              }
            >
              <DropdownMenuRadioItem value="agent">
                <BotIcon className="mr-2 size-4" />
                <span>{t("chat.modeAgent")}</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ask">
                <FileQuestionIcon className="mr-2 size-4" />
                <span>{t("chat.modeAsk")}</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled || models.length === 0}
              className={cn(
                composerFooterControlClassName,
                "inline-flex max-w-44 min-w-0 items-center gap-1.5",
                "data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:dark:bg-input/50"
              )}
              title={
                selectedModel
                  ? getModelDisplayName(selectedModel)
                  : model || undefined
              }
            >
              <span className="truncate">
                {selectedModel
                  ? getModelDisplayName(selectedModel)
                  : t("chat.noModel")}
              </span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-sm">
            <DropdownMenuRadioGroup value={model} onValueChange={onModelChange}>
              {renderModelOptions(models, modelProviders)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {showThinkingToggle ? (
          <Toggle
            pressed={thinkingEnabled}
            onPressedChange={onThinkingEnabledChange}
            variant="composer"
            size="sm"
            className={cn(
              composerFooterControlClassName,
              composerFooterControlActiveClassName,
              "max-w-36"
            )}
            disabled={disabled}
            aria-label={t("chat.thinkingToggle")}
            title={
              thinkingEnabled
                ? t("chat.thinkingEnabled")
                : t("chat.thinkingDisabled")
            }
          >
            <BrainIcon className="size-4 shrink-0" />
            <span className="truncate">{t("chat.thinkingToggleLabel")}</span>
          </Toggle>
        ) : null}
      </div>
    </div>
  );
}
