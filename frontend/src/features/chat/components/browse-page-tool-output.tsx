"use client";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { formatBrowsePageOutputForDisplay } from "@/features/agent/tools/browse-page-display";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type BrowsePageToolOutputProps = {
  output: unknown;
  className?: string;
};

export function BrowsePageToolOutput({
  output,
  className,
}: BrowsePageToolOutputProps) {
  const { t } = useTranslation();
  const formatted = formatBrowsePageOutputForDisplay(output);
  if (!formatted) {
    return null;
  }

  const contentTruncatedHint = formatted.contentDisplayTruncated
    ? t("chat.toolOutputContentTruncated", {
        shown: formatted.content.length.toLocaleString(),
        total: formatted.contentTotalChars.toLocaleString(),
      })
    : undefined;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("chat.toolOutputMetadata")}
        </h4>
        <CodeBlock code={formatted.metadataJson} language="json" />
      </div>

      {formatted.fetchTruncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("chat.toolOutputFetchTruncated")}
        </p>
      ) : null}

      <div className="space-y-2">
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("chat.toolOutputPageContent")}
        </h4>
        <CodeBlock
          code={formatted.content || t("chat.toolOutputEmptyContent")}
          language="markdown"
          truncatedHint={contentTruncatedHint}
        />
      </div>
    </div>
  );
}
