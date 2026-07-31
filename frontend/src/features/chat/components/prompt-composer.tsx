import type { ChatStatus, FileUIPart } from "ai";
import type { Editor } from "@tiptap/core";
import { FolderOpenIcon, GitBranchIcon, XIcon } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { toast } from "sonner";

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
import { PromptComposerAttachmentsHeader } from "./prompt-composer-attachments";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import { findModelEntry, parseModelValue, type ModelProviderEntry } from "@/lib/model-provider/resolve-provider-config";
import {
  normalizeEnhancedPrompt,
  PROMPT_ENHANCE_SYSTEM_PROMPT,
  streamEnhancePrompt,
} from "../lib/prompt-enhance";
import { canToggleThinking } from "@/features/agent/thinking-preference";
import { cn } from "@/lib/utils";
import type { AgentMode } from "@/features/agent/types";
import type { McpServerConfig, SessionKind } from "@/lib/db";

import { collectNativeFileDropItems } from "@/lib/dnd/external-file-drop";

import { processNativeFileDropItems } from "../lib/process-native-file-drop-items";

import { useRegisterHotkeyAction } from "@/features/keyboard-shortcuts/hotkey-actions-context";

import { ComposerContextUsage } from "./composer-context-usage";
import { ComposerEditTag } from "./composer-edit-tag";
import { ComposerFooterControls } from "./composer-footer-controls";
import { ComposerRichInput } from "./composer-rich-input";
import { extractSkillSlugsFromEditor, serializeEditorToAgentText } from "../lib/composer-serialize";
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
  /** Provider-tagged model entries; each has a unique composite `value`. */
  entries?: ModelProviderEntry[];
  /** Resolves a human-readable label for a provider id (preset or custom). */
  getProviderLabel?: (providerId: string) => string;
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
  /** Skill allowlist when editing an existing user or queued message. */
  initialReferencedSkills?: readonly string[];
  contextUsage?: SessionContextUsage | null;
  /** Enabled MCP servers available to attach (selectable in the "+" menu). */
  mcpServers?: McpServerConfig[];
  /** Server ids currently attached to this session. */
  attachedMcpServers?: string[];
  /** Toggle a server's attachment for this session. */
  onToggleMcpServer?: (serverId: string) => void;
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

function ComposerHotkeyActions({
  onSubmit,
  supportsMultimodal,
  editorRef,
}: {
  onSubmit: (message: PromptInputMessage) => void;
  supportsMultimodal: boolean;
  editorRef: RefObject<Editor | null>;
}) {
  const attachments = usePromptInputAttachments();

  useRegisterHotkeyAction("chat.send", () => {
    const editorText = editorRef.current
      ? serializeEditorToAgentText(editorRef.current).trim()
      : "";
    const hasFiles = supportsMultimodal && attachments.files.length > 0;
    if (!editorText && !hasFiles) {
      return false;
    }

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
  const hasWorkspace = Boolean(workspaceName);

  const workspacePickerLabel = workspaceName
    ? t("chat.workspaceSelected", { name: workspaceName })
    : t("chat.selectWorkspace");

  return (
    <div className="relative z-0 -mt-3 flex flex-wrap items-center gap-1 bg-muted/50 px-2 pb-2 pt-5 dark:bg-[#1c1c1f] sm:px-3">
      <Button
        aria-label={workspacePickerLabel}
        className="h-8 max-w-full min-w-0 shrink-0 rounded-xl px-2.5 sm:max-w-44"
        disabled={isRunning || !onPickWorkspace}
        onClick={onPickWorkspace}
        title={workspacePickerLabel}
        type="button"
        variant="ghost"
      >
        <FolderOpenIcon className="size-4 shrink-0" />
        <span className="truncate">{workspaceName ?? t("chat.localWork")}</span>
        {hasWorkspace && onClearWorkspace ? (
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
        ) : null}
      </Button>

      {gitBranch ? (
        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm text-muted-foreground">
          <GitBranchIcon className="size-4 shrink-0" />
          <span className="truncate">{gitBranch}</span>
        </span>
      ) : null}
    </div>
  );
}

export const PromptComposer = memo(function PromptComposer({
  initialValue: initialValueProp,
  onSend,
  onStop,
  model,
  entries,
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
  initialReferencedSkills,
  contextUsage,
  mcpServers,
  attachedMcpServers,
  onToggleMcpServer,
  agentMode = "agent",
  onAgentModeChange,
  planBuiltAt,
  sessionKind = "standard",
  onSessionKindChange,
  getProviderLabel,
}: PromptComposerProps) {
  const { t } = useTranslation();
  const { resolveProviderForValue } = useModelProvider();
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
  }, [composerKey, initialValueProp]);

  const editorRef = useRef<Editor | null>(null);
  const submitStatus = resolveSubmitStatus(isRunning, Boolean(onStop));
  const selectedModel = findModelEntry(entries, model)?.model;
  const supportsMultimodal = selectedModel?.supportsMultimodal ?? false;
  const providerConfig = useMemo(
    () => resolveProviderForValue(model),
    [model, resolveProviderForValue]
  );
  const showThinkingToggle =
    canToggleThinking(selectedModel) && Boolean(onThinkingEnabledChange);
  const attachmentAccept = supportsMultimodal ? COMPOSER_ATTACHMENT_ACCEPT : undefined;
  const queueActionLabel = isEditing
    ? t("chat.queueUpdate")
    : t("chat.queueAdd");

  const showAttachmentError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  const handleAttachmentError = useCallback(
    (error: PromptInputAttachmentError) => {
      let message: string;
      switch (error.code) {
        case "accept":
          message = supportsMultimodal
            ? t("chat.attachmentErrorAccept")
            : t("chat.attachmentErrorMultimodalUnsupported");
          break;
        case "max_file_size":
          message = t("chat.attachmentErrorMaxSize", { size: COMPOSER_MAX_FILE_SIZE_LABEL });
          break;
        case "max_files":
          message = t("chat.attachmentErrorMaxFiles", { count: COMPOSER_MAX_FILES });
          break;
      }
      showAttachmentError(message);
    },
    [showAttachmentError, supportsMultimodal, t]
  );

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

      void processNativeFileDropItems({
        items,
        workspaceDir,
        addAttachments,
        onError: showAttachmentError,
        messages: dropMessages(),
      });
    },
    [dropMessages, showAttachmentError, workspaceDir]
  );

  const handleNativeFileDrop = useCallback(
    ({ dataTransfer, addAttachments }: NativeFileDropEvent) => {
      runNativeFileDrop(collectNativeFileDropItems(dataTransfer), addAttachments);
    },
    [runNativeFileDrop]
  );

  const handleChange = useCallback((nextValue: string) => {
    setValue(nextValue);
  }, []);

  // ----- Prompt enhancement (streaming) -----
  const [enhancing, setEnhancing] = useState(false);
  const enhanceAbortRef = useRef<AbortController | null>(null);
  const enhanceAccumRef = useRef("");
  const enhanceRafRef = useRef<number | null>(null);

  /** Replace the editor content with plain text without HTML parsing. */
  const setEditorPlainText = useCallback((text: string) => {
    const editor = editorRef.current;
    if (editor) {
      editor.commands.clearContent();
      if (text) {
        const { view } = editor;
        // After clearContent the document has one empty paragraph.
        // Position 1 is *inside* that paragraph — insert text there to
        // avoid creating a new paragraph on line 2.
        view.dispatch(editor.state.tr.insertText(text, 1));
      }
    }
    setValue(text);
  }, []);

  const toggleEnhance = useCallback(async () => {
    if (enhancing) {
      // Pause: abort the in-flight stream.
      enhanceAbortRef.current?.abort();
      enhanceAbortRef.current = null;
      if (enhanceRafRef.current !== null) {
        cancelAnimationFrame(enhanceRafRef.current);
        enhanceRafRef.current = null;
      }
      setEnhancing(false);
      const normalized = normalizeEnhancedPrompt(enhanceAccumRef.current);
      enhanceAccumRef.current = normalized;
      setEditorPlainText(normalized);
      return;
    }

    const resolved = resolveProviderForValue(model);
    if (!resolved) {
      return;
    }
    const original = valueRef.current;
    if (!original.trim()) {
      return;
    }

    setEnhancing(true);
    enhanceAccumRef.current = "";
    // Reset RAF ref and flush any stale frame from a previous incomplete run.
    if (enhanceRafRef.current !== null) {
      cancelAnimationFrame(enhanceRafRef.current);
      enhanceRafRef.current = null;
    }
    const controller = new AbortController();
    enhanceAbortRef.current = controller;

    try {
      await streamEnhancePrompt(
        {
          baseUrl: resolved.baseUrl,
          apiKey: resolved.apiKey,
          apiKeySource: resolved.apiKeySource,
          apiKeyEnvVar: resolved.apiKeyEnvVar,
          model: parseModelValue(model).modelId,
          // Wrap the original prompt in explicit markers so the model clearly
          // sees it as raw text to rewrite/improve, not as a direct query.
          // Using ---BEGIN PROMPT---/---END PROMPT--- instead of ``` to avoid
          // conflicts when the user's text already contains code fences.
          userPrompt: `---BEGIN PROMPT---\n${original}\n---END PROMPT---`,
          systemPrompt: PROMPT_ENHANCE_SYSTEM_PROMPT,
        },
        {
          signal: controller.signal,
          onDelta: (delta) => {
            enhanceAccumRef.current += delta;
            // Schedule an editor update on the next animation frame.
            // This prevents blocking the main thread (and stuttering the
            // spinner) when deltas arrive faster than the display refresh rate.
            if (enhanceRafRef.current === null) {
              enhanceRafRef.current = requestAnimationFrame(() => {
                enhanceRafRef.current = null;
                const displayText = enhanceAccumRef.current.trimStart();
                if (displayText) {
                  setEditorPlainText(displayText);
                }
              });
            }
          },
        }
      );
      // Stream finished — cancel any pending RAF and show the complete text.
      if (enhanceRafRef.current !== null) {
        cancelAnimationFrame(enhanceRafRef.current);
        enhanceRafRef.current = null;
      }
      const normalized = normalizeEnhancedPrompt(enhanceAccumRef.current);
      enhanceAccumRef.current = normalized;
      setEditorPlainText(normalized);
    } catch (error) {
      // AbortError means the user paused — keep the accumulated text as-is.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Prompt enhancement failed:", error);
        toast.error(t("chat.enhancePromptFailed"));
      }
    } finally {
      if (enhanceAbortRef.current === controller) {
        enhanceAbortRef.current = null;
      }
      setEnhancing(false);
    }
  }, [enhancing, model, resolveProviderForValue, setEditorPlainText, t]);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const editorText = editorRef.current
        ? serializeEditorToAgentText(editorRef.current)
        : valueRef.current;
      const text = editorText.trim() || message.text.trim();
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
    >
      <ComposerHotkeyActions
        onSubmit={handleSubmit}
        supportsMultimodal={supportsMultimodal}
        editorRef={editorRef}
      />
      <PromptComposerAttachmentsHeader />

      <PromptInputBody>
        <ComposerRichInput
          editorRef={editorRef}
          initialReferencedSkills={initialReferencedSkills}
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

      <PromptInputFooter className="flex-row flex-nowrap items-center gap-1 bg-card px-2 py-2 sm:gap-1.5 sm:px-3">
        <ComposerFooterControls
          agentMode={agentMode}
          isRunning={isRunning}
          model={model}
          entries={entries}
          getProviderLabel={getProviderLabel}
          onAgentModeChange={onAgentModeChange}
          onModelChange={onModelChange}
          onSessionKindChange={onSessionKindChange}
          onThinkingEnabledChange={onThinkingEnabledChange}
          planBuiltAt={planBuiltAt}
          sessionKind={sessionKind}
          showThinkingToggle={showThinkingToggle}
          thinkingEnabled={thinkingEnabled}
          inputText={value}
          enhancing={enhancing}
          onToggleEnhance={providerConfig ? toggleEnhance : undefined}
          mcpServers={mcpServers}
          attachedMcpServers={attachedMcpServers}
          onToggleMcpServer={onToggleMcpServer}
        />

        <div className="ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
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
        className={cn(
          "overflow-hidden rounded-3xl border border-border shadow-none transition-[border-color,box-shadow,background-color] duration-200",
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
