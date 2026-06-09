"use client";

import { useEffect, useState } from "react";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseReadFileToolError } from "@/features/agent/tools/parse-read-file-tool-error";
import type { ReadFileData } from "@/features/agent/tools/types";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n/message-schema";
import { cn } from "@/lib/utils";

import { guessLanguageFromPath } from "../lib/guess-language-from-path";
import { readWorkspaceFile } from "../lib/read-workspace-file";

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
  const [data, setData] = useState<ReadFileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceDir) {
      setData(null);
      setErrorKey("rightPanel.noWorkspace");
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setData(null);
    setErrorKey(null);
    setErrorMessage(null);

    void (async () => {
      try {
        const result = await readWorkspaceFile(workspaceDir, path);
        if (!cancelled) {
          setData(result);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }

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
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, workspaceDir]);

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

  if (!data) {
    return null;
  }

  return (
    <ScrollArea className={cn("h-full min-h-0", className)}>
      <div className="flex min-h-full flex-col gap-2 p-2">
        {data.containsSecrets ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {t("rightPanel.previewSecretsWarning")}
          </div>
        ) : null}

        <CodeBlock
          className="min-h-0 border-none"
          code={data.content}
          language={guessLanguageFromPath(path)}
          showLineNumbers
        />

        {data.truncated ? (
          <p className="px-1 text-xs text-muted-foreground">
            {t("rightPanel.previewTruncated", {
              endLine: data.endLine,
              totalLines: data.totalLines,
            })}
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );
}
