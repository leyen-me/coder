import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { BotIcon, ClipboardListIcon } from "lucide-react";
import { memo } from "react";

type PlanPreviewCardProps = {
  content: string;
  isStreaming?: boolean;
  showBuildAction?: boolean;
  isBuildPending?: boolean;
  onBuild?: () => void;
  className?: string;
};

export const PlanPreviewCard = memo(function PlanPreviewCard({
  content,
  isStreaming = false,
  showBuildAction = false,
  isBuildPending = false,
  onBuild,
  className,
}: PlanPreviewCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xs",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <ClipboardListIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{t("chat.planFileName")}</span>
        {isStreaming ? (
          <span className="text-xs text-muted-foreground">{t("chat.planGenerating")}</span>
        ) : null}
      </div>
      <div className="px-4 py-3">
        {content.trim() ? (
          isStreaming ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{content}</div>
          ) : (
            <MarkdownRenderer>{content}</MarkdownRenderer>
          )
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
            <span className="animate-pulse">...</span>
          </div>
        ) : null}
      </div>
      {showBuildAction && onBuild ? (
        <div className="flex justify-end border-t bg-muted/20 px-4 py-2.5">
          <Button
            type="button"
            size="sm"
            disabled={isBuildPending || isStreaming || !content.trim()}
            onClick={onBuild}
          >
            <BotIcon className="size-3.5" />
            {t("chat.buildWithAgent")}
          </Button>
        </div>
      ) : null}
    </div>
  );
});
