import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type ThinkingBlockProps = {
  content: string;
  isStreaming?: boolean;
  className?: string;
};

export function ThinkingBlock({
  content,
  isStreaming = false,
  className,
}: ThinkingBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(isStreaming);

  if (!content.trim() && !isStreaming) {
    return null;
  }

  return (
    <div className={cn("rounded-xl border bg-muted/30 px-3 py-2", className)}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span>
          {isStreaming ? t("chat.thinkingInProgress") : t("chat.thinking")}
        </span>
      </button>
      {expanded ? (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted-foreground">
          {content || t("chat.thinkingPlaceholder")}
        </pre>
      ) : null}
    </div>
  );
}
