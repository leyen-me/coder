import {
  BotIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  FileQuestionIcon,
  FolderOpenIcon,
  ServerIcon,
  XIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

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
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  getModelDisplayName,
} from "@/lib/model-provider/model-definition";
import type { ModelProviderEntry } from "@/lib/model-provider/resolve-provider-config";
import { findModelEntry } from "@/lib/model-provider/resolve-provider-config";
import type { ProviderId } from "@/lib/model-provider/types";
import { cn } from "@/lib/utils";
import { PRESET_PROVIDER_LABELS } from "@/lib/model-provider/constants";
import type { ScheduledJobAgentMode } from "@/features/scheduled-jobs/lib/api";
import type { McpServerConfig } from "@/lib/db";

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

  const items: ReactNode[] = [];
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
            {getModelDisplayName(entry.model)}
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
  entries?: ModelProviderEntry[];
  /** Resolves a human-readable label for a provider id (preset or custom). */
  getProviderLabel?: (providerId: string) => string;
  /** 已启用的 MCP 服务，创建/编辑自动化时可选择附带。 */
  mcpServers?: McpServerConfig[];
  attachedMcpServers?: string[];
  onToggleMcpServer?: (serverId: string) => void;
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
  entries,
  getProviderLabel,
  mcpServers,
  attachedMcpServers,
  onToggleMcpServer,
  disabled = false,
}: AutomationRunSettingsProps) {
  const { t } = useTranslation();
  const selectedModel = findModelEntry(entries, model)?.model;
  const showThinkingToggle = canToggleThinking(selectedModel);
  const attachedMcpSet = useMemo(
    () => new Set(attachedMcpServers ?? []),
    [attachedMcpServers]
  );
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
              disabled={disabled || !entries?.length}
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
              {renderModelOptions(entries, getProviderLabel)}
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

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled || (!mcpServers?.length && !attachedMcpServers?.length)}
              className={cn(
                composerFooterControlClassName,
                "inline-flex min-w-0 items-center gap-1.5",
                "data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:dark:bg-input/50"
              )}
              title={t("chat.mcpServers")}
            >
              <ServerIcon className="size-3.5 shrink-0" />
              <span className="truncate">{t("chat.mcpServers")}</span>
              {attachedMcpServers?.length ? (
                <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] leading-4">
                  {attachedMcpServers.length}
                </span>
              ) : null}
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[min(50vh,20rem)] w-[min(16rem,calc(100vw-5rem))] overflow-y-auto"
          >
            {mcpServers?.length ? (
              mcpServers.map((server) => {
                const active = attachedMcpSet.has(server.id);
                return (
                  <DropdownMenuItem
                    key={server.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      onToggleMcpServer?.(server.id);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate" title={server.name}>
                      {server.name}
                    </span>
                    {active ? <CheckIcon className="size-4 shrink-0" /> : null}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("chat.mcpServersEmpty")}
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
