"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseReadFileToolError } from "@/features/agent/tools/parse-read-file-tool-error";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n/message-schema";
import { cn } from "@/lib/utils";

import { guessLanguageFromPath } from "../lib/guess-language-from-path";
import { readWorkspaceFile } from "../lib/read-workspace-file";
import { saveWorkspaceFile } from "../lib/save-workspace-file";
import type { FileEditorSession } from "../hooks/use-file-editor-sessions";
import { MonacoPreviewEditor } from "./monaco-preview-editor";

type FilePreviewProps = {
  workspaceDir: string | null;
  path: string;
  className?: string;
  onSessionChange?: (path: string, session: FileEditorSession | null) => void;
};

function formatPreviewError(code: string | undefined): MessageKey | null {
  if (code === "binary_file") {
    return "rightPanel.previewBinary";
  }

  if (code === "file_too_large") {
    return "rightPanel.previewTooLarge";
  }

  if (code === "gitignored") {
    return "rightPanel.previewGitignored";
  }

  if (code === "file_changed") {
    return "rightPanel.previewFileChanged";
  }

  return null;
}

function resolvePreviewError(error: unknown): {
  code?: string;
  message: string;
} {
  const structured = parseReadFileToolError(error);
  if (structured) {
    return {
      code: structured.code,
      message: structured.message,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return { message: "Failed to load file preview" };
}

export function FilePreview({
  workspaceDir,
  path,
  className,
  onSessionChange,
}: FilePreviewProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [sha256, setSha256] = useState("");
  const [containsSecrets, setContainsSecrets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveErrorKey, setSaveErrorKey] = useState<MessageKey | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const isDirty = content !== savedContent;

  const loadFile = useCallback(async () => {
    if (!workspaceDir) {
      setContent("");
      setSavedContent("");
      setSha256("");
      setContainsSecrets(false);
      setErrorKey("rightPanel.noWorkspace");
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    setErrorKey(null);
    setErrorMessage(null);
    setSaveErrorKey(null);
    setSaveErrorMessage(null);

    try {
      const result = await readWorkspaceFile(workspaceDir, path);
      setContent(result.content);
      setSavedContent(result.content);
      setSha256(result.sha256);
      setContainsSecrets(result.containsSecrets);
    } catch (loadError) {
      setContent("");
      setSavedContent("");
      setSha256("");
      setContainsSecrets(false);

      const parsed = resolvePreviewError(loadError);
      const messageKey = formatPreviewError(parsed.code);
      if (messageKey) {
        setErrorKey(messageKey);
        setErrorMessage(null);
      } else {
        setErrorKey(null);
        setErrorMessage(parsed.message);
      }
    } finally {
      setLoading(false);
    }
  }, [path, workspaceDir]);

  useEffect(() => {
    void loadFile();
  }, [loadFile]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!workspaceDir) {
      return false;
    }

    if (!isDirty || saving) {
      return !isDirty;
    }

    setSaving(true);
    setSaveErrorKey(null);
    setSaveErrorMessage(null);

    try {
      const result = await saveWorkspaceFile(
        workspaceDir,
        path,
        content,
        sha256
      );
      setSavedContent(content);
      setSha256(result.sha256);
      return true;
    } catch (saveError) {
      const parsed = resolvePreviewError(saveError);
      const messageKey = formatPreviewError(parsed.code);
      if (messageKey) {
        setSaveErrorKey(messageKey);
        setSaveErrorMessage(null);
      } else {
        setSaveErrorKey(null);
        setSaveErrorMessage(parsed.message);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [content, isDirty, path, saving, sha256, workspaceDir]);

  const contentRef = useRef(content);
  const savedContentRef = useRef(savedContent);
  const handleSaveRef = useRef(handleSave);
  contentRef.current = content;
  savedContentRef.current = savedContent;
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (!onSessionChange || loading || errorKey || errorMessage) {
      onSessionChange?.(path, null);
      return;
    }

    onSessionChange(path, {
      isDirty: () => contentRef.current !== savedContentRef.current,
      save: () => handleSaveRef.current(),
      isSaving: saving,
      saveErrorKey,
      saveErrorMessage,
      onReload: loadFile,
    });

    return () => {
      onSessionChange(path, null);
    };
  }, [
    content,
    errorKey,
    errorMessage,
    loadFile,
    loading,
    onSessionChange,
    path,
    saveErrorKey,
    saveErrorMessage,
    saving,
  ]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center px-4 text-sm text-muted-foreground",
          className
        )}
      >
        {t("rightPanel.previewLoading")}
      </div>
    );
  }

  if (errorKey) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground",
          className
        )}
      >
        {t(errorKey)}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center px-4 text-center text-sm text-destructive",
          className
        )}
      >
        {errorMessage}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {containsSecrets ? (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("rightPanel.previewSecretsWarning")}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <MonacoPreviewEditor
          language={guessLanguageFromPath(path)}
          onChange={setContent}
          onSave={() => {
            void handleSave();
          }}
          path={path}
          value={content}
        />
      </div>
    </div>
  );
}
