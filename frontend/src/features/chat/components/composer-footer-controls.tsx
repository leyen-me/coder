import type { ReactElement } from "react";
import {
  BrainIcon,
  BotIcon,
  ClipboardListIcon,
  FileQuestionIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
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
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import type { AgentMode } from "@/features/agent/types";
import type { SessionKind } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  getModelDisplayName,
} from "@/lib/model-provider/model-definition";
import type { ModelProviderEntry } from "@/lib/model-provider/resolve-provider-config";
import { findModelEntry } from "@/lib/model-provider/resolve-provider-config";
import type { ProviderId } from "@/lib/model-provider/types";
import { PRESET_PROVIDER_LABELS } from "@/lib/model-provider/constants";
import { cn } from "@/lib/utils";

const compactControlClassName =
  "inline-flex h-8 min-h-8 min-w-0 items-center gap-1 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-accent data-[state=open]:text-foreground";

function renderModelOptions(
  entries: readonly ModelProviderEntry[] | undefined,
  getProviderLabel?: (providerId: string) => string
) {
  if (!entries || entries.length === 0) {
    return null;
  }

  const groups = new Map<string, ModelProviderEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.providerId);
    if (group) {
      group.push(entry);
    } else {
      groups.set(entry.providerId, [entry]);
    }
  }

  const fallbackLabel = (id: string) =>
    PRESET_PROVIDER_LABELS[id as ProviderId] ?? id;

  const items: ReactElement[] = [];
  let groupIndex = 0;
  for (const [providerId, providerEntries] of groups) {
    if (groupIndex > 0) {
      items.push(<DropdownMenuSeparator key={`sep-${providerId}`} />);
    }
    items.push(
      <DropdownMenuGroup key={providerId}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {getProviderLabel ? getProviderLabel(providerId) : fallbackLabel(providerId)}
        </DropdownMenuLabel>
        {providerEntries.map((entry) => (
          <DropdownMenuRadioItem key={entry.value} value={entry.value}>
            <span className="truncate" title={getModelDisplayName(entry.model)}>
              {getModelDisplayName(entry.model)}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuGroup>
    );
    groupIndex++;
  }

  return items;
}

type ComposerFooterControlsProps = {
  agentMode: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  planBuiltAt?: number | null;
  sessionKind: SessionKind;
  onSessionKindChange?: (kind: SessionKind) => void;
  model: string;
  /** Provider-tagged model entries; each has a unique composite `value`. */
  entries?: ModelProviderEntry[];
  /** Resolves a human-readable label for a provider id (preset or custom). */
  getProviderLabel?: (providerId: string) => string;
  onModelChange: (model: string) => void;
  showThinkingToggle: boolean;
  thinkingEnabled: boolean;
  onThinkingEnabledChange?: (enabled: boolean) => void;
  isRunning: boolean;
  /** Current composer text; the enhance icon shows only when non-empty. */
  inputText?: string;
  /** Whether a prompt-enhancement stream is in progress (rotates the icon). */
  enhancing?: boolean;
  /** Toggle the prompt-enhancement stream (start when idle, pause when running). */
  onToggleEnhance?: () => void;
};

export function ComposerFooterControls({
  agentMode,
  onAgentModeChange,
  planBuiltAt,
  sessionKind,
  onSessionKindChange,
  model,
  entries,
  getProviderLabel,
  onModelChange,
  showThinkingToggle,
  thinkingEnabled,
  onThinkingEnabledChange,
  isRunning,
  inputText,
  enhancing = false,
  onToggleEnhance,
}: ComposerFooterControlsProps) {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();
  const selectedModel = findModelEntry(entries, model)?.model;
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
      {renderModelOptions(entries, getProviderLabel)}
    </DropdownMenuRadioGroup>
  );

  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={
              (isRunning && !showThinkingToggle) ||
              (!onAgentModeChange && !onSessionKindChange && !entries?.length)
            }
            className={cn(
              compactControlClassName,
              "group size-8 shrink-0 justify-center px-0"
            )}
            aria-label={t("chat.composerMoreActions")}
            title={t("chat.composerMoreActions")}
          >
            <PlusIcon className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-45" />
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
            <DropdownMenuSubTrigger disabled={!entries?.length && !showThinkingToggle}>
              <span className="min-w-0 flex-1 truncate">{t("chat.composerModelLabel")}</span>
              <DropdownMenuShortcut className="max-w-16 truncate tracking-normal normal-case">
                {modelLabel}
              </DropdownMenuShortcut>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[min(50vh,20rem)] w-[min(14rem,calc(100vw-5rem))] overflow-y-auto">
              {entries?.length ? (
                modelMenu
              ) : (
                <DropdownMenuLabel>{t("chat.noModel")}</DropdownMenuLabel>
              )}
              {showThinkingToggle ? (
                <>
                  {entries?.length ? <DropdownMenuSeparator /> : null}
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
      {onToggleEnhance && (enhancing || inputText?.trim()) ? (
        <button
          type="button"
          disabled={!enhancing && isRunning}
          onClick={() => onToggleEnhance?.()}
          className={cn(
            compactControlClassName,
            "group size-8 shrink-0 justify-center px-0",
            enhancing && "text-foreground"
          )}
          aria-label={enhancing ? t("chat.enhancePromptStop") : t("chat.enhancePrompt")}
          title={enhancing ? t("chat.enhancePromptStop") : t("chat.enhancePrompt")}
        >
          {enhancing ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin" />
          ) : (
            <SparklesIcon className="size-4 shrink-0" />
          )}
        </button>
      ) : null}
    </div>
  );
}
