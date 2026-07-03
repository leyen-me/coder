import type { ChatStatus, FileUIPart } from "ai";
import type { Editor } from "@tiptap/core";
import { BrainIcon, BotIcon, ChevronDownIcon, ClipboardListIcon, FileQuestionIcon, FolderOpenIcon, GitBranchIcon, XIcon } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  usePromptInputAttachments,
  type NativeFileDropEvent,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { PromptComposerAttachmentsHeader } from "./prompt-composer-attachments";
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
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  findModelDefinition,
  getModelDisplayName,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import type { ProviderId } from "@/lib/model-provider/types";
import { canToggleThinking } from "@/features/agent/thinking-preference";
import { cn } from "@/lib/utils";
import type { AgentMode } from "@/features/agent/types";
import type { SessionKind } from "@/lib/db";

import { collectNativeFileDropItems } from "@/lib/dnd/external-file-drop";

import { insertFileMentionIntoComposer } from "../lib/composer-insert-store";
import {
  pathsToNativeFileDropItems,
  processNativeFileDropItems,
} from "../lib/process-native-file-drop-items";
import { useWorkspacePathDropTarget } from "../hooks/use-workspace-path-drop-target";

import { useRegisterHotkeyAction } from "@/features/keyboard-shortcuts/hotkey-actions-context";

import { ComposerContextUsage } from "./composer-context-usage";
import { ComposerEditTag } from "./composer-edit-tag";
import { ComposerRichInput } from "./composer-rich-input";
import { extractSkillSlugsFromEditor } from "../lib/composer-serialize";
import {
  composerFooterControlActiveClassName,
  composerFooterControlClassName,
} from "@/components/ai-elements/composer-footer-control";
import type { SessionContextUsage } from "../lib/estimate-session-context-usage";

/** Images only until non-image parsing is implemented. */
export const COMPOSER_ATTACHMENT_ACCEPT = "image/*";
export const COMPOSER_MAX_FILES = 10;
export const COMPOSER_MAX_FILE_SIZE = 10 * 1024 * 1024;
const COMPOSER_MAX_FILE_SIZE_LABEL = "10 MB";

type PromptInputAttachmentError = {
  code: "max_files" | "max_file_size" | "accept";
  message: string;
};

type PromptComposerProps = {
  /** Initial value for editing mode. PromptComposer owns its own input state. */
  initialValue?: string;
  onSend?: (payload: { text: string; files: FileUIPart[]; skillSlugs?: string[] }) => Promise<void>;
  onStop?: () => void;
  model: string;
  models: readonly ModelDefinition[];
  /** Maps model ID → provider ID for grouping models in the dropdown. */
  modelProviders?: Map<string, ProviderId>;
  onModelChange: (model: string) => void;
  agentMode?: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  /** When set, the plan has been built — Plan mode is no longer selectable. */
  planBuiltAt?: number | null;
  sessionKind?: SessionKind;
  onSessionKindChange?: (kind: SessionKind) => void;
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (enabled: boolean) => void;
  showWorkspaceControls?: boolean;
  workspaceDir?: string | null;
  workspaceName?: string | null;
  onPickWorkspace?: () => void;
  onClearWorkspace?: () => void;
  isGitRepository?: boolean;
  gitBranch?: string | null;
  variant?: "full" | "compact";
  isRunning?: boolean;
  className?: string;
  composerKey?: string;
  initialFiles?: FileUIPart[];
  onCancelEdit?: () => void;
  contextUsage?: SessionContextUsage | null;
};

function resolveSubmitStatus(
  isRunning: boolean,
  hasStopHandler: boolean
): ChatStatus {
  if (!isRunning) {
    return "ready";
  }

  return hasStopHandler ? "streaming" : "submitted";
}

type ComposerSubmitProps = {
  value: string;
  isRunning: boolean;
  onStop?: () => void;
  submitStatus: ChatStatus;
  supportsMultimodal: boolean;
  queueActionLabel?: string;
};

type ComposerAttachmentErrorProps = {
  message: string | null;
  onClear: () => void;
};

function ComposerAttachmentError({
  message,
  onClear,
}: ComposerAttachmentErrorProps) {
  const attachments = usePromptInputAttachments();

  useEffect(() => {
    if (attachments.files.length > 0) {
      onClear();
    }
  }, [attachments.files.length, onClear]);

  if (!message) {
    return null;
  }

  return (
    <p className="px-4 pt-2 text-destructive text-xs" role="alert">
      {message}
    </p>
  );
}

function ComposerHotkeyActions({
  onSubmit,
  supportsMultimodal,
}: {
  onSubmit: (message: PromptInputMessage) => void;
  supportsMultimodal: boolean;
}) {
  const attachments = usePromptInputAttachments();

  useRegisterHotkeyAction("chat.send", () => {
    onSubmit({
      text: "",
      files: supportsMultimodal ? attachments.files : [],
    });
    return true;
  });

  return null;
}

function ComposerSubmit({
  value,
  isRunning,
  onStop,
  submitStatus,
  supportsMultimodal,
  queueActionLabel,
}: ComposerSubmitProps) {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();
  const canSend =
    value.trim().length > 0 ||
    (supportsMultimodal && attachments.files.length > 0);

  const isStopMode = isRunning && Boolean(onStop);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {isRunning && canSend ? (
        <Button
          className="h-9 rounded-full px-3"
          type="submit"
          variant="secondary"
        >
          {queueActionLabel ?? t("chat.queueAdd")}
        </Button>
      ) : null}
      <PromptInputSubmit
        className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
        disabled={isStopMode ? false : !canSend}
        onStop={onStop}
        status={submitStatus}
      />
    </div>
  );
}

type ComposerTauriFileDropBridgeProps = {
  dropTargetRef: RefObject<HTMLElement | null>;
  onDropPaths: (
    paths: string[],
    addAttachments: (files: File[] | FileList) => void
  ) => void;
};

function ComposerTauriFileDropBridge({
  dropTargetRef,
  onDropPaths,
}: ComposerTauriFileDropBridgeProps) {
  const attachments = usePromptInputAttachments();

  const handleDrop = useCallback(
    (paths: string[]) => {
      onDropPaths(paths, attachments.add);
    },
    [attachments.add, onDropPaths]
  );

  return null;
}

type ComposerContextBarProps = {
  workspaceName?: string | null;
  onPickWorkspace?: () => void;
  onClearWorkspace?: () => void;
  isRunning: boolean;
  gitBranch?: string | null;
};

function ComposerContextBar({
  workspaceName,
  onPickWorkspace,
  onClearWorkspace,
  isRunning,
  gitBranch,
}: ComposerContextBarProps) {
  const { t } = useTranslation();
  const showClearWorkspace =
    Boolean(workspaceName) && Boolean(onClearWorkspace);

  const workspacePickerLabel = workspaceName
    ? t("chat.workspaceSelected", { name: workspaceName })
    : t("chat.selectWorkspace");

  return (
    <div className="relative z-0 -mt-3 flex items-center gap-1 bg-muted/50 px-3 pb-2 pt-5 dark:bg-[#1c1c1f]">
      {showClearWorkspace ? (
        <Button
          aria-label={workspacePickerLabel}
          className="h-8 max-w-44 min-w-0 shrink-0 rounded-xl px-2.5"
          disabled={isRunning || !onPickWorkspace}
          onClick={onPickWorkspace}
          title={workspacePickerLabel}
          type="button"
          variant="ghost"
        >
          <FolderOpenIcon className="size-4 shrink-0" />
          <span className="truncate">{workspaceName}</span>
          {onClearWorkspace && (
            <span
              aria-disabled={isRunning}
              aria-label={t("chat.clearWorkspace")}
              className="-mr-0.5 ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full opacity-50 transition-all hover:bg-foreground/10 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                if (!isRunning) onClearWorkspace();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!isRunning) onClearWorkspace();
                }
              }}
              role="button"
              tabIndex={-1}
              title={t("chat.clearWorkspace")}
            >
              <XIcon className="size-3" strokeWidth={2} />
            </span>
          )}
        </Button>
      ) : (
        <Button
          aria-label={workspacePickerLabel}
          className="h-8 max-w-44 min-w-0 shrink-0 rounded-xl px-2.5"
          disabled={isRunning || !onPickWorkspace}
          onClick={onPickWorkspace}
          title={workspacePickerLabel}
          type="button"
          variant="ghost"
        >
          <FolderOpenIcon className="size-4 shrink-0" />
          <span className="truncate">{t("chat.localWork")}</span>
        </Button>
      )}

      {gitBranch ? (
        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs text-muted-foreground">
          <GitBranchIcon className="size-3.5 shrink-0" />
          <span className="truncate">{gitBranch}</span>
        </span>
      ) : null}
    </div>
  );
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  glm: "GLM",
  agnes: "Agnes",
  nvidia: "NVIDIA",
  minimax: "MiniMax",
  custom: "Custom",
};

/**
 * Renders model dropdown items grouped by provider when modelProviders is provided.
 */
function renderModelOptions(
  models: readonly ModelDefinition[],
  modelProviders?: Map<string, ProviderId>
) {
  if (!modelProviders) {
    // Flat list (backward compat)
    return models.map((item) => (
      <DropdownMenuRadioItem key={item.id} value={item.id}>
        {getModelDisplayName(item)}
      </DropdownMenuRadioItem>
    ));
  }

  // Group models by provider
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

  const items: React.ReactElement[] = [];
  let groupIndex = 0;
  for (const [providerId, providerModels] of groups) {
    if (groupIndex > 0) {
      items.push(
        <DropdownMenuSeparator key={`sep-${providerId}`} />
      );
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
    groupIndex++;
  }

  return items;
}

export const PromptComposer = memo(function PromptComposer({
  initialValue: initialValueProp,
  onSend,
  onStop,
  model,
  models,
  onModelChange,
  thinkingEnabled = false,
  onThinkingEnabledChange,
  showWorkspaceControls = true,
  workspaceDir,
  workspaceName,
  onPickWorkspace,
  onClearWorkspace,
  gitBranch,
  variant = "full",
  isRunning = false,
  className,
  composerKey,
  initialFiles,
  onCancelEdit,
  contextUsage,
  agentMode = "agent",
  onAgentModeChange,
  planBuiltAt,
  sessionKind = "standard",
  onSessionKindChange,
  modelProviders,
}: PromptComposerProps) {
  const { t } = useTranslation();
  const isCompact = variant === "compact";
  const isEditing = Boolean(onCancelEdit);

  // Self-managed input value — decouples PromptComposer from parent re-renders
  const [value, setValue] = useState(initialValueProp ?? "");
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Reset value when initialValueProp or composerKey changes (editing transitions)
  useEffect(() => {
    setValue(initialValueProp ?? "");
  }, [composerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const editorRef = useRef<Editor | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const submitStatus = resolveSubmitStatus(isRunning, Boolean(onStop));
  const selectedModel = findModelDefinition(models, model);
  const supportsMultimodal = selectedModel?.supportsMultimodal ?? false;
  const showThinkingToggle =
    canToggleThinking(selectedModel) && Boolean(onThinkingEnabledChange);
  const attachmentAccept = supportsMultimodal ? COMPOSER_ATTACHMENT_ACCEPT : undefined;
  const queueActionLabel = isEditing
    ? t("chat.queueUpdate")
    : t("chat.queueAdd");

  const clearAttachmentError = useCallback(() => {
    setAttachmentError(null);
  }, []);

  const handleAttachmentError = useCallback(
    (error: PromptInputAttachmentError) => {
      switch (error.code) {
        case "accept":
          setAttachmentError(
            supportsMultimodal
              ? t("chat.attachmentErrorAccept")
              : t("chat.attachmentErrorMultimodalUnsupported")
          );
          break;
        case "max_file_size":
          setAttachmentError(
            t("chat.attachmentErrorMaxSize", { size: COMPOSER_MAX_FILE_SIZE_LABEL })
          );
          break;
        case "max_files":
          setAttachmentError(
            t("chat.attachmentErrorMaxFiles", { count: COMPOSER_MAX_FILES })
          );
          break;
      }
    },
    [supportsMultimodal, t]
  );

  const handleWorkspacePathDrop = useCallback((path: string) => {
    insertFileMentionIntoComposer(path);
  }, []);

  const dropMessages = useCallback(
    () => ({
      externalDropImageLoadFailed: t("chat.externalDropImageLoadFailed"),
      externalDropInvalidPath: t("chat.externalDropInvalidPath"),
      externalDropPathUnresolved: t("chat.externalDropPathUnresolved"),
      externalDropUnsupportedRuntime: t("chat.externalDropUnsupportedRuntime"),
    }),
    [t]
  );

  const runNativeFileDrop = useCallback(
    (
      items: ReturnType<typeof collectNativeFileDropItems>,
      addAttachments: (files: File[] | FileList) => void
    ) => {
      if (items.length === 0) {
        return;
      }

      setAttachmentError(null);
      void processNativeFileDropItems({
        items,
        workspaceDir,
        addAttachments,
        onError: setAttachmentError,
        messages: dropMessages(),
      });
    },
    [dropMessages, workspaceDir]
  );

  const handleNativeFileDrop = useCallback(
    ({ dataTransfer, addAttachments }: NativeFileDropEvent) => {
      runNativeFileDrop(collectNativeFileDropItems(dataTransfer), addAttachments);
    },
    [runNativeFileDrop]
  );

  const handleTauriNativeFileDrop = useCallback(
    (paths: string[], addAttachments: (files: File[] | FileList) => void) => {
      runNativeFileDrop(pathsToNativeFileDropItems(paths), addAttachments);
    },
    [runNativeFileDrop]
  );

  const dropTargetRef = useRef<HTMLDivElement>(null);
  useWorkspacePathDropTarget(dropTargetRef, handleWorkspacePathDrop);

  const handleChange = useCallback((nextValue: string) => {
    setValue(nextValue);
  }, []);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      // Read current value from ref to avoid stale closures
      const text = valueRef.current.trim() || message.text.trim();
      const hasText = text.length > 0;
      const hasFiles = supportsMultimodal && message.files.length > 0;
      if (!hasText && !hasFiles) {
        return;
      }

      // Extract skill slugs from the editor document tree (actual skillReference
      // nodes) rather than regex-matching the serialized text. This prevents
      // plain-text /xxx from being falsely treated as skill references.
      const skillSlugs = editorRef.current
        ? extractSkillSlugsFromEditor(editorRef.current)
        : [];

      // Clear immediately for responsive UX
      setValue("");

      try {
        await onSend?.({
          text,
          files: supportsMultimodal ? message.files : [],
          skillSlugs,
        });
      } catch {
        // Restore value on send failure so the user doesn't lose their input
        setValue(text);
      }
    },
    [onSend, supportsMultimodal]
  );

  const promptInputClassName = cn(
    "w-full",
    "[&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:overflow-hidden",
    "[&_[data-slot=input-group]]:rounded-none [&_[data-slot=input-group]]:border-0",
    "[&_[data-slot=input-group]]:bg-transparent",
    "[&_[data-slot=input-group]]:text-card-foreground [&_[data-slot=input-group]]:shadow-none",
    "[&_[data-slot=input-group]]:dark:bg-transparent [&_[data-slot=input-group]]:has-disabled:opacity-100",
    "[&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:border-transparent",
    "[&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:ring-0",
    "[&_[data-slot=input-group-control]]:text-foreground",
    "[&_[data-slot=input-group-control]:focus-visible]:border-transparent",
    "[&_[data-slot=input-group-control]:focus-visible]:ring-0",
    "[&_[data-slot=input-group-control]:disabled:cursor-not-allowed",
    "[&_[data-slot=input-group-control]:disabled:opacity-100"
  );

  const composerInput = (
    <PromptInput
      key={composerKey}
      className={promptInputClassName}
      accept={attachmentAccept}
      initialFiles={supportsMultimodal ? initialFiles : []}
      maxFileSize={COMPOSER_MAX_FILE_SIZE}
      maxFiles={COMPOSER_MAX_FILES}
      multiple
      onError={handleAttachmentError}
      onSubmit={handleSubmit}
      onNativeFileDrop={handleNativeFileDrop}
      onWorkspacePathDrop={handleWorkspacePathDrop}
    >
      <ComposerHotkeyActions
        onSubmit={handleSubmit}
        supportsMultimodal={supportsMultimodal}
      />
      <ComposerTauriFileDropBridge
        dropTargetRef={dropTargetRef}
        onDropPaths={handleTauriNativeFileDrop}
      />
      <PromptComposerAttachmentsHeader />
      <ComposerAttachmentError
        message={attachmentError}
        onClear={clearAttachmentError}
      />

      <PromptInputBody>
        <ComposerRichInput
          editorRef={editorRef}
          onCancelEdit={onCancelEdit}
          onChange={handleChange}
          placeholder={
            agentMode === "plan"
              ? t("chat.composerPlanPlaceholder")
              : t("chat.composerPlaceholder")
          }
          value={value}
          workspaceDir={workspaceDir}
          className={cn(
            "px-4 py-4 text-base text-foreground",
            "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
            isCompact ? "min-h-[72px]" : "min-h-[120px]"
          )}
        />
      </PromptInputBody>

      <PromptInputFooter className="bg-card px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {/* Agent / Ask / Plan mode selector */}
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
                {agentMode === "agent" ? (
                  <BotIcon className="size-3.5 shrink-0" />
                ) : agentMode === "plan" ? (
                  <ClipboardListIcon className="size-3.5 shrink-0" />
                ) : (
                  <FileQuestionIcon className="size-3.5 shrink-0" />
                )}
                <span className="truncate">
                  {agentMode === "agent"
                    ? t("chat.modeAgent")
                    : agentMode === "plan"
                      ? t("chat.modePlan")
                      : t("chat.modeAsk")}
                </span>
                <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-32">
              <DropdownMenuRadioGroup
                value={agentMode}
                onValueChange={(value) => {
                  onAgentModeChange?.(value as AgentMode);
                }}
              >
                <DropdownMenuRadioItem value="agent">
                  <BotIcon className="mr-2 size-4" />
                  <span>{t("chat.modeAgent")}</span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="ask">
                  <FileQuestionIcon className="mr-2 size-4" />
                  <span>{t("chat.modeAsk")}</span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="plan" disabled={Boolean(planBuiltAt)}>
                  <ClipboardListIcon className="mr-2 size-4" />
                  <span>{t("chat.modePlan")}</span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
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

          {/* Model selector */}
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
                title={selectedModel ? getModelDisplayName(selectedModel) : model || undefined}
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
              <DropdownMenuRadioGroup
                value={model}
                onValueChange={onModelChange}
              >
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

        <div className="flex shrink-0 items-center gap-1.5">
          {contextUsage ? (
            <ComposerContextUsage contextUsage={contextUsage} />
          ) : null}
          <ComposerSubmit
            isRunning={isRunning}
            onStop={onStop}
            queueActionLabel={queueActionLabel}
            submitStatus={submitStatus}
            supportsMultimodal={supportsMultimodal}
            value={value}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <div className={cn("flex w-full max-w-3xl flex-col", className)}>
      <div
        ref={dropTargetRef}
        className={cn(
          "overflow-hidden rounded-3xl border border-border shadow-none transition-[border-color,box-shadow,background-color] duration-200",
          "data-[workspace-path-drop-hover=true]:border-primary/50",
          "data-[workspace-path-drop-hover=true]:bg-primary/5",
          "data-[workspace-path-drop-hover=true]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_16%,transparent)]",
          !showWorkspaceControls && "bg-card text-card-foreground",
          isCompact && "shadow-sm"
        )}
      >
        {showWorkspaceControls ? (
          <div className="relative z-1 rounded-3xl bg-card text-card-foreground shadow-[0_6px_12px_-4px_rgb(0_0_0/0.08)] dark:shadow-[0_8px_16px_-4px_rgb(0_0_0/0.45)]">
            <div className="overflow-hidden rounded-3xl">
              {isEditing && onCancelEdit ? (
                <ComposerEditTag
                  dismissLabel={t("chat.cancelEdit")}
                  label={t("chat.editingMessage")}
                  onDismiss={onCancelEdit}
                />
              ) : null}
              {composerInput}
            </div>
          </div>
        ) : (
          <>
            {isEditing && onCancelEdit ? (
              <ComposerEditTag
                dismissLabel={t("chat.cancelEdit")}
                label={t("chat.editingMessage")}
                onDismiss={onCancelEdit}
              />
            ) : null}
            {composerInput}
          </>
        )}

        {showWorkspaceControls ? (
          <ComposerContextBar
            gitBranch={gitBranch}
            isRunning={isRunning}
            onClearWorkspace={onClearWorkspace}
            onPickWorkspace={onPickWorkspace}
            workspaceName={workspaceName}
          />
        ) : null}
      </div>
    </div>
  );
});
