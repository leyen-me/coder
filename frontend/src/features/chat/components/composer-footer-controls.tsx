import type { ReactElement } from "react";
import {
  BrainIcon,
  BotIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  FileQuestionIcon,
  ImageIcon,
  PlusIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import {
  composerFooterControlActiveClassName,
  composerFooterControlClassName,
} from "@/components/ai-elements/composer-footer-control";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import type { AgentMode } from "@/features/agent/types";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SessionKind } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  findModelDefinition,
  getModelDisplayName,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import type { ProviderId } from "@/lib/model-provider/types";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  glm: "GLM",
  agnes: "Agnes",
  nvidia: "NVIDIA",
  minimax: "MiniMax",
  custom: "Custom",
};

const mobileCompactControlClassName =
  "inline-flex h-8 min-h-8 min-w-0 items-center gap-1 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-accent data-[state=open]:text-foreground";

function renderModelOptions(
  models: readonly ModelDefinition[],
  modelProviders?: Map<string, ProviderId>
) {
  if (!modelProviders) {
    return models.map((item) => (
      <DropdownMenuRadioItem key={item.id} value={item.id}>
        <span className="truncate" title={getModelDisplayName(item)}>
          {getModelDisplayName(item)}
        </span>
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

  const items: ReactElement[] = [];
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
            <span className="truncate" title={getModelDisplayName(item)}>
              {getModelDisplayName(item)}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuGroup>
    );
    groupIndex++;
  }

  return items;
}

function resolveAgentModeLabel(
  agentMode: AgentMode,
  t: (key: "chat.modeAgent" | "chat.modeAsk" | "chat.modePlan") => string
) {
  if (agentMode === "agent") {
    return t("chat.modeAgent");
  }
  if (agentMode === "plan") {
    return t("chat.modePlan");
  }
  return t("chat.modeAsk");
}

function resolveAgentModeIcon(agentMode: AgentMode) {
  if (agentMode === "agent") {
    return BotIcon;
  }
  if (agentMode === "plan") {
    return ClipboardListIcon;
  }
  return FileQuestionIcon;
}

type ComposerFooterControlsProps = {
  agentMode: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  planBuiltAt?: number | null;
  sessionKind: SessionKind;
  onSessionKindChange?: (kind: SessionKind) => void;
  model: string;
  models: readonly ModelDefinition[];
  modelProviders?: Map<string, ProviderId>;
  onModelChange: (model: string) => void;
  showThinkingToggle: boolean;
  thinkingEnabled: boolean;
  onThinkingEnabledChange?: (enabled: boolean) => void;
  isRunning: boolean;
};

export function ComposerFooterControls({
  agentMode,
  onAgentModeChange,
  planBuiltAt,
  sessionKind,
  onSessionKindChange,
  model,
  models,
  modelProviders,
  onModelChange,
  showThinkingToggle,
  thinkingEnabled,
  onThinkingEnabledChange,
  isRunning,
}: ComposerFooterControlsProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const attachments = usePromptInputAttachments();
  const selectedModel = findModelDefinition(models, model);
  const AgentModeIcon = resolveAgentModeIcon(agentMode);
  const agentModeLabel = resolveAgentModeLabel(agentMode, (key) => t(key));
  const modelLabel = selectedModel
    ? getModelDisplayName(selectedModel)
    : t("chat.noModel");
  const sessionKindLabel =
    sessionKind === "long_task"
      ? t("chat.sessionTypeLongTask")
      : t("chat.sessionTypeStandard");

  const agentModeMenu = (
    <DropdownMenuRadioGroup
      value={agentMode}
      onValueChange={(value) => {
        onAgentModeChange?.(value as AgentMode);
      }}
    >
      <DropdownMenuRadioItem value="agent" disabled={isRunning || !onAgentModeChange}>
        <BotIcon className="mr-2 size-4" />
        <span>{t("chat.modeAgent")}</span>
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="ask" disabled={isRunning || !onAgentModeChange}>
        <FileQuestionIcon className="mr-2 size-4" />
        <span>{t("chat.modeAsk")}</span>
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem
        value="plan"
        disabled={Boolean(planBuiltAt) || isRunning || !onAgentModeChange}
      >
        <ClipboardListIcon className="mr-2 size-4" />
        <span>{t("chat.modePlan")}</span>
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );

  const modelMenu = (
    <DropdownMenuRadioGroup value={model} onValueChange={onModelChange}>
      {renderModelOptions(models, modelProviders)}
    </DropdownMenuRadioGroup>
  );

  if (isMobile) {
    return (
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={
                (isRunning && !showThinkingToggle) ||
                (!onAgentModeChange && !onSessionKindChange && models.length === 0)
              }
              className={cn(
                mobileCompactControlClassName,
                "size-8 shrink-0 justify-center px-0"
              )}
              aria-label={t("chat.composerMoreActions")}
              title={t("chat.composerMoreActions")}
            >
              <PlusIcon className="size-4 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-48 max-w-[calc(100vw-1.5rem)]"
            side="top"
          >
            {agentModeMenu}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => attachments.openFileDialog()}>
              <ImageIcon className="size-4" />
              <span>{t("chat.addAttachment")}</span>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={models.length === 0 && !showThinkingToggle}>
                <span className="min-w-0 flex-1 truncate">{t("chat.composerModelLabel")}</span>
                <DropdownMenuShortcut className="max-w-16 truncate tracking-normal normal-case">
                  {modelLabel}
                </DropdownMenuShortcut>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[min(50vh,20rem)] w-[min(14rem,calc(100vw-5rem))] overflow-y-auto">
                {models.length > 0 ? (
                  modelMenu
                ) : (
                  <DropdownMenuLabel>{t("chat.noModel")}</DropdownMenuLabel>
                )}
                {showThinkingToggle ? (
                  <>
                    {models.length > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      disabled={isRunning}
                      onSelect={(event) => {
                        event.preventDefault();
                        onThinkingEnabledChange?.(!thinkingEnabled);
                      }}
                    >
                      <BrainIcon className="size-4" />
                      <span className="flex-1">{t("chat.thinkingToggleLabel")}</span>
                      <Switch
                        checked={thinkingEnabled}
                        className="pointer-events-none"
                        size="sm"
                      />
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {onSessionKindChange ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={isRunning}>
                  <span className="min-w-0 flex-1 truncate">{t("chat.sessionTypeLabel")}</span>
                  <DropdownMenuShortcut className="max-w-16 truncate tracking-normal normal-case">
                    {sessionKindLabel}
                  </DropdownMenuShortcut>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[min(12rem,calc(100vw-5rem))]">
                  <DropdownMenuRadioGroup
                    value={sessionKind}
                    onValueChange={(value) => {
                      onSessionKindChange(value as SessionKind);
                    }}
                  >
                    <DropdownMenuRadioItem value="standard">
                      <span>{t("chat.sessionTypeStandard")}</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="long_task">
                      <span>{t("chat.sessionTypeLongTask")}</span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isRunning || !onAgentModeChange}
            className={cn(
              composerFooterControlClassName,
              "inline-flex items-center gap-1.5",
              "data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:dark:bg-input/50"
            )}
            title={
              agentMode === "agent"
                ? t("chat.modeAgentLabel")
                : agentMode === "plan"
                  ? t("chat.modePlanLabel")
                  : t("chat.modeAskLabel")
            }
          >
            <AgentModeIcon className="size-3.5 shrink-0" />
            <span className="truncate">{agentModeLabel}</span>
            <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-32">
          {agentModeMenu}
        </DropdownMenuContent>
      </DropdownMenu>

      {onSessionKindChange ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isRunning}
              className={cn(
                composerFooterControlClassName,
                sessionKind === "long_task" &&
                  composerFooterControlActiveClassName,
                "inline-flex items-center gap-1.5",
                "data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:dark:bg-input/50"
              )}
              title={
                sessionKind === "long_task"
                  ? t("chat.sessionTypeLongTaskLabel")
                  : t("chat.sessionTypeStandardLabel")
              }
            >
              <span className="truncate">
                {sessionKind === "long_task"
                  ? t("chat.sessionTypeLongTask")
                  : t("chat.sessionTypeStandard")}
              </span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuRadioGroup
              value={sessionKind}
              onValueChange={(value) => {
                onSessionKindChange(value as SessionKind);
              }}
            >
              <DropdownMenuRadioItem value="standard">
                <span>{t("chat.sessionTypeStandard")}</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="long_task">
                <span>{t("chat.sessionTypeLongTask")}</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={models.length === 0}
            className={cn(
              composerFooterControlClassName,
              "inline-flex max-w-44 items-center gap-1.5",
              "data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:dark:bg-input/50"
            )}
            title={
              selectedModel ? getModelDisplayName(selectedModel) : model || undefined
            }
          >
            <span className="truncate">{modelLabel}</span>
            <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-w-sm">
          {modelMenu}
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
          disabled={isRunning}
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
  );
}
