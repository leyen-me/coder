import type { ChatStatus, FileUIPart } from "ai";
import { ChevronDownIcon, FolderOpenIcon, GitBranchIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { PromptComposerAttachmentsHeader } from "./prompt-composer-attachments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

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
  models: readonly string[];
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
}: ComposerSubmitProps) {
  const attachments = usePromptInputAttachments();
  const canSend =
    value.trim().length > 0 || attachments.files.length > 0;

  return (
    <PromptInputSubmit
      className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
      disabled={!canSend && !isRunning}
      onStop={onStop}
      status={submitStatus}
    />
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
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const submitStatus = resolveSubmitStatus(isRunning, Boolean(onStop));
  const showBranch =
    showWorkspaceControls && isGitRepository && Boolean(onGitBranchChange);

  const clearAttachmentError = useCallback(() => {
    setAttachmentError(null);
  }, []);

  const handleAttachmentError = useCallback(
    (error: PromptInputAttachmentError) => {
      switch (error.code) {
        case "accept":
          setAttachmentError(t("chat.attachmentErrorAccept"));
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
    [t]
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (isRunning) {
        return;
      }

      const hasText = message.text.trim().length > 0;
      const hasFiles = message.files.length > 0;
      if (!hasText && !hasFiles) {
        return;
      }

      onSend?.({
        text: message.text.trim(),
        files: message.files,
      });
    },
    [isRunning, onSend]
  );

  return (
    <PromptInput
      key={composerKey}
      className={cn(
        "w-full max-w-3xl",
        "[&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:overflow-hidden",
        "[&_[data-slot=input-group]]:rounded-3xl",
        "[&_[data-slot=input-group]]:border-border [&_[data-slot=input-group]]:bg-card",
        "[&_[data-slot=input-group]]:text-card-foreground [&_[data-slot=input-group]]:shadow-none",
        "[&_[data-slot=input-group]]:dark:bg-card [&_[data-slot=input-group]]:has-disabled:opacity-100",
        "[&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:border-border",
        "[&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        "[&_[data-slot=input-group-control]]:text-foreground",
        "[&_[data-slot=input-group-control]:focus-visible]:border-transparent",
        "[&_[data-slot=input-group-control]:focus-visible]:ring-0",
        "[&_[data-slot=input-group-control]:disabled:cursor-not-allowed",
        "[&_[data-slot=input-group-control]:disabled:opacity-100",
        isCompact && "[&_[data-slot=input-group]]:shadow-sm",
        className
      )}
      accept={COMPOSER_ATTACHMENT_ACCEPT}
      initialFiles={initialFiles}
      maxFileSize={COMPOSER_MAX_FILE_SIZE}
      maxFiles={COMPOSER_MAX_FILES}
      multiple
      onError={handleAttachmentError}
      onSubmit={handleSubmit}
    >
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

      <PromptInputFooter className="border-t border-border/60 bg-card px-3 py-2">
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger
              aria-label={t("chat.addAttachment")}
              className="shrink-0 rounded-xl"
              disabled={isRunning}
              variant="ghost"
            >
              <PlusIcon className="size-4" />
            </PromptInputActionMenuTrigger>
            <PromptInputActionMenuContent align="start">
              <PromptInputActionAddAttachments
                label={t("chat.addAttachment")}
              />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>

          {showWorkspaceControls ? (
            <>
              <PromptInputButton
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
              </PromptInputButton>

              {showBranch ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PromptInputButton
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
                    </PromptInputButton>
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
            </>
          ) : null}
        </PromptInputTools>

        <div className="flex shrink-0 items-center gap-1">
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
            <PromptInputSelectContent align="end" className="max-w-sm">
              {models.map((item) => (
                <PromptInputSelectItem key={item} value={item}>
                  {item}
                </PromptInputSelectItem>
              ))}
            </PromptInputSelectContent>
          </PromptInputSelect>

          <ComposerSubmit
            isRunning={isRunning}
            onStop={onStop}
            submitStatus={submitStatus}
            value={value}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
}
