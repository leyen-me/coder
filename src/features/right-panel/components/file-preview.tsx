"use client";

import { LoaderCircleIcon, SaveIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { parseReadFileToolError } from "@/features/agent/tools/parse-read-file-tool-error";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n/message-schema";
import { cn } from "@/lib/utils";

import { guessLanguageFromPath } from "../lib/guess-language-from-path";
import { readWorkspaceFile } from "../lib/read-workspace-file";
import { saveWorkspaceFile } from "../lib/save-workspace-file";
import { MonacoPreviewEditor } from "./monaco-preview-editor";

type FilePreviewProps = {
  workspaceDir: string | null;
  path: string;
  className?: string;
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

  const handleSave = useCallback(async () => {
    if (!workspaceDir || !isDirty || saving) {
      return;
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
    } finally {
      setSaving(false);
    }
  }, [content, isDirty, path, saving, sha256, workspaceDir]);

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

      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
        <Button
          disabled={!isDirty || saving || !workspaceDir}
          onClick={() => {
            void handleSave();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {saving ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <SaveIcon className="size-3.5" />
          )}
          {saving ? t("rightPanel.previewSaving") : t("rightPanel.previewSave")}
        </Button>
        {isDirty ? (
          <span className="text-xs text-muted-foreground">
            {t("rightPanel.previewUnsaved")}
          </span>
        ) : null}
        {saveErrorKey ? (
          <span className="text-xs text-destructive">{t(saveErrorKey)}</span>
        ) : null}
        {saveErrorMessage ? (
          <span className="text-xs text-destructive">{saveErrorMessage}</span>
        ) : null}
        {saveErrorKey === "rightPanel.previewFileChanged" ? (
          <Button
            onClick={() => {
              void loadFile();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("rightPanel.previewReload")}
          </Button>
        ) : null}
      </div>

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
