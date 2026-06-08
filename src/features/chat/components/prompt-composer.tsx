import type { ChatStatus, FileUIPart } from "ai";
import { ChevronDownIcon, FolderOpenIcon, GitBranchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
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
  getModelSelectLabel,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import { cn } from "@/lib/utils";

import { ComposerEditTag } from "./composer-edit-tag";

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
  showWorkspaceControls?: boolean;
  workspaceName?: string | null;
  onPickWorkspace?: () => void;
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

  return (
    <PromptInputSubmit
      className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
      disabled={!canSend && !isRunning}
      onStop={onStop}
      status={submitStatus}
    />
  );
}

function ComposerMultimodalGuard({ enabled }: { enabled: boolean }) {
  const attachments = usePromptInputAttachments();

  useEffect(() => {
    if (!enabled && attachments.files.length > 0) {
      attachments.clear();
    }
  }, [attachments, enabled]);

  return null;
}

type ComposerContextBarProps = {
  workspaceName?: string | null;
  onPickWorkspace?: () => void;
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
  isRunning,
  showBranch,
  gitBranch,
  gitBranches,
  onGitBranchChange,
  isGitLoading,
}: ComposerContextBarProps) {
  const { t } = useTranslation();

  return (
    <div className="relative z-0 -mt-3 flex items-center gap-1 bg-muted/50 px-3 pb-2 pt-5 dark:bg-[#1c1c1f]">
      <Button
        aria-label={
          workspaceName
            ? t("chat.workspaceSelected", { name: workspaceName })
            : t("chat.selectWorkspace")
        }
        className="h-8 max-w-40 shrink-0 rounded-xl px-2.5"
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
  showWorkspaceControls = true,
  workspaceName,
  onPickWorkspace,
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

      onSend?.({
        text: message.text.trim(),
        files: supportsMultimodal ? message.files : [],
      });
    },
    [isRunning, onSend, supportsMultimodal]
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
    >
      <ComposerMultimodalGuard enabled={supportsMultimodal} />
      <PromptComposerAttachmentsHeader />
      <ComposerAttachmentError
        message={attachmentError}
        onClear={clearAttachmentError}
      />

      <PromptInputBody>
        <PromptInputTextarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && onCancelEdit) {
              event.preventDefault();
              onCancelEdit();
            }
          }}
          placeholder={t("chat.composerPlaceholder")}
          className={cn(
            "px-4 py-4 text-base text-foreground",
            isCompact ? "min-h-[72px]" : "min-h-[120px]"
          )}
          readOnly={isRunning}
        />
      </PromptInputBody>

      <PromptInputFooter className="bg-card px-3 py-2">
        <PromptInputSelect
          value={model}
          onValueChange={onModelChange}
          disabled={isRunning || models.length === 0}
        >
          <PromptInputSelectTrigger
            className="h-8 max-w-56 rounded-xl px-2.5 [&_[data-slot=select-value]]:truncate"
            title={model || undefined}
          >
            <PromptInputSelectValue placeholder={t("chat.noModel")} />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent align="start" className="max-w-sm">
            {models.map((item) => (
              <PromptInputSelectItem key={item.id} value={item.id}>
                {getModelSelectLabel(item)}
              </PromptInputSelectItem>
            ))}
          </PromptInputSelectContent>
        </PromptInputSelect>

        <ComposerSubmit
          isRunning={isRunning}
          onStop={onStop}
          submitStatus={submitStatus}
          supportsMultimodal={supportsMultimodal}
          value={value}
        />
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
        className={cn(
          "overflow-hidden rounded-3xl border border-border shadow-none",
          !showWorkspaceControls && "bg-card text-card-foreground",
          isCompact && "shadow-sm"
        )}
      >
        {showWorkspaceControls ? (
          <div className="relative z-[1] rounded-3xl bg-card text-card-foreground shadow-[0_6px_12px_-4px_rgb(0_0_0/0.08)] dark:shadow-[0_8px_16px_-4px_rgb(0_0_0/0.45)]">
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
            onPickWorkspace={onPickWorkspace}
            showBranch={showBranch}
            workspaceName={workspaceName}
          />
        ) : null}
      </div>
    </div>
  );
}
