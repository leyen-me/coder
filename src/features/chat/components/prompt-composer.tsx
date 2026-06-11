import type { ChatStatus, FileUIPart } from "ai";
import { BrainIcon, BotIcon, ChevronDownIcon, FileQuestionIcon, FolderOpenIcon, GitBranchIcon, XIcon } from "lucide-react";
import {
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  findModelDefinition,
  getModelDisplayName,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import { canToggleThinking } from "@/features/agent/thinking-preference";
import { cn } from "@/lib/utils";
import type { AgentMode } from "@/features/agent/types";

import { collectNativeFileDropItems } from "@/lib/dnd/external-file-drop";

import { insertFileMentionIntoComposer } from "../lib/composer-insert-store";
import {
  pathsToNativeFileDropItems,
  processNativeFileDropItems,
} from "../lib/process-native-file-drop-items";
import { useTauriNativeFileDropTarget } from "../hooks/use-tauri-native-file-drop-target";
import { useWorkspacePathDropTarget } from "../hooks/use-workspace-path-drop-target";

import { ComposerContextUsage } from "./composer-context-usage";
import { ComposerEditTag } from "./composer-edit-tag";
import { ComposerRichInput } from "./composer-rich-input";
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
  value: string;
  onChange: (value: string) => void;
  onSend?: (payload: { text: string; files: FileUIPart[] }) => void;
  onStop?: () => void;
  model: string;
  models: readonly ModelDefinition[];
  onModelChange: (model: string) => void;
  agentMode?: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (enabled: boolean) => void;
  showWorkspaceControls?: boolean;
  workspaceDir?: string | null;
  workspaceName?: string | null;
  onPickWorkspace?: () => void;
  onClearWorkspace?: () => void;
  isGitRepository?: boolean;
  gitBranch?: string | null;
  gitBranches?: readonly string[];
  onGitBranchChange?: (branch: string) => void;
  isGitLoading?: boolean;
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

function ComposerSubmit({
  value,
  isRunning,
  onStop,
  submitStatus,
  supportsMultimodal,
}: ComposerSubmitProps) {
  const attachments = usePromptInputAttachments();
  const canSend =
    value.trim().length > 0 ||
    (supportsMultimodal && attachments.files.length > 0);

  const isStopMode = isRunning && Boolean(onStop);

  return (
    <PromptInputSubmit
      className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
      disabled={isStopMode ? false : !canSend}
      onStop={onStop}
      status={submitStatus}
    />
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

  useTauriNativeFileDropTarget(dropTargetRef, handleDrop);

  return null;
}

type ComposerContextBarProps = {
  workspaceName?: string | null;
  onPickWorkspace?: () => void;
  onClearWorkspace?: () => void;
  isRunning: boolean;
  showBranch: boolean;
  gitBranch?: string | null;
  gitBranches: readonly string[];
  onGitBranchChange?: (branch: string) => void;
  isGitLoading: boolean;
};

function ComposerContextBar({
  workspaceName,
  onPickWorkspace,
  onClearWorkspace,
  isRunning,
  showBranch,
  gitBranch,
  gitBranches,
  onGitBranchChange,
  isGitLoading,
}: ComposerContextBarProps) {
  const { t } = useTranslation();
  const showClearWorkspace =
    Boolean(workspaceName) && Boolean(onClearWorkspace);

  return (
    <div className="relative z-0 -mt-3 flex items-center gap-1 bg-muted/50 px-3 pb-2 pt-5 dark:bg-[#1c1c1f]">
      <Button
        aria-label={
          workspaceName
            ? t("chat.workspaceSelected", { name: workspaceName })
            : t("chat.selectWorkspace")
        }
        className="group h-8 max-w-44 min-w-0 shrink-0 rounded-xl px-2.5"
        disabled={isRunning || !onPickWorkspace}
        onClick={onPickWorkspace}
        title={
          workspaceName
            ? t("chat.workspaceSelected", { name: workspaceName })
            : t("chat.selectWorkspace")
        }
        type="button"
        variant="ghost"
      >
        <FolderOpenIcon className="size-4 shrink-0" />
        <span className="truncate">
          {workspaceName ?? t("chat.localWork")}
        </span>
        {showClearWorkspace ? (
          <XIcon
            aria-label={t("chat.clearWorkspace")}
            className="ml-1 size-3.5 shrink-0 cursor-pointer rounded-sm opacity-60 transition-all duration-150 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onClearWorkspace?.();
            }}
          />
        ) : null}
      </Button>

      {showBranch ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("chat.selectGitBranch")}
              className="h-8 max-w-36 shrink-0 rounded-xl px-2.5"
              disabled={isRunning || isGitLoading || !onGitBranchChange}
              title={gitBranch ?? t("chat.selectGitBranch")}
              type="button"
              variant="ghost"
            >
              <GitBranchIcon className="size-4 shrink-0" />
              <span className="truncate">
                {isGitLoading
                  ? t("chat.gitBranchLoading")
                  : (gitBranch ?? t("chat.selectGitBranch"))}
              </span>
              <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 min-w-40 overflow-y-auto">
            <DropdownMenuRadioGroup
              value={gitBranch ?? ""}
              onValueChange={(branch) => {
                if (branch && branch !== gitBranch) {
                  onGitBranchChange?.(branch);
                }
              }}
            >
              {gitBranches.map((branch) => (
                <DropdownMenuRadioItem key={branch} value={branch}>
                  {branch}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function PromptComposer({
  value,
  onChange,
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
  isGitRepository = false,
  gitBranch,
  gitBranches = [],
  onGitBranchChange,
  isGitLoading = false,
  variant = "full",
  isRunning = false,
  className,
  composerKey,
  initialFiles,
  onCancelEdit,
  contextUsage,
  agentMode = "agent",
  onAgentModeChange,
}: PromptComposerProps) {
  const { t } = useTranslation();
  const isCompact = variant === "compact";
  const isEditing = Boolean(onCancelEdit);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const submitStatus = resolveSubmitStatus(isRunning, Boolean(onStop));
  const showBranch =
    showWorkspaceControls && isGitRepository && Boolean(onGitBranchChange);
  const selectedModel = findModelDefinition(models, model);
  const supportsMultimodal = selectedModel?.supportsMultimodal ?? false;
  const showThinkingToggle =
    canToggleThinking(selectedModel) && Boolean(onThinkingEnabledChange);
  const attachmentAccept = supportsMultimodal ? COMPOSER_ATTACHMENT_ACCEPT : undefined;

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

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (isRunning) {
        return;
      }

      const hasText = message.text.trim().length > 0;
      const hasFiles = supportsMultimodal && message.files.length > 0;
      if (!hasText && !hasFiles) {
        return;
      }

      onChange("");
      onSend?.({
        text: message.text.trim(),
        files: supportsMultimodal ? message.files : [],
      });
    },
    [isRunning, onChange, onSend, supportsMultimodal]
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
          onCancelEdit={onCancelEdit}
          onChange={onChange}
          placeholder={t("chat.composerPlaceholder")}
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
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

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
                {models.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={item.id}>
                    {getModelDisplayName(item)}
                  </DropdownMenuRadioItem>
                ))}
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
            submitStatus={submitStatus}
            supportsMultimodal={supportsMultimodal}
            value={value}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <div className={cn("flex w-full max-w-3xl flex-col gap-1.5", className)}>
      {isEditing && onCancelEdit ? (
        <ComposerEditTag
          dismissLabel={t("chat.cancelEdit")}
          label={t("chat.editingMessage")}
          onDismiss={onCancelEdit}
        />
      ) : null}

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
            <div className="overflow-hidden rounded-3xl">{composerInput}</div>
          </div>
        ) : (
          composerInput
        )}

        {showWorkspaceControls ? (
          <ComposerContextBar
            gitBranch={gitBranch}
            gitBranches={gitBranches}
            isGitLoading={isGitLoading}
            isRunning={isRunning}
            onGitBranchChange={onGitBranchChange}
            onClearWorkspace={onClearWorkspace}
            onPickWorkspace={onPickWorkspace}
            showBranch={showBranch}
            workspaceName={workspaceName}
          />
        ) : null}
      </div>
    </div>
  );
}
