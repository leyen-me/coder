import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SessionKind } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type SessionTitleLabelProps = {
  title: string;
  sessionKind?: SessionKind;
  isGenerating?: boolean;
  /** compact: sidebar row; header: top bar */
  variant?: "compact" | "header";
  className?: string;
  /** Double-click handler, intended for header variant to scroll to bottom. */
  onDoubleClick?: () => void;
  /** When set, shows a button to open the workspace directory in the file manager. */
  workspaceDir?: string | null;
};

export function SessionTitleLabel({
  title,
  sessionKind = "standard",
  isGenerating = false,
  variant = "compact",
  className,
  onDoubleClick,
  workspaceDir,
}: SessionTitleLabelProps) {
  const { t } = useTranslation();

  const classNames = cn(
    "min-w-0 truncate",
    variant === "header" ? "text-sm font-medium" : "text-sm",
    isGenerating && "text-muted-foreground"
  );

  const handleOpenWorkspace = () => {
    if (workspaceDir) {
      window.open(workspaceDir, "_blank");
    }
  };

  if (variant === "header") {
    return (
      <div
        className="flex min-w-0 cursor-default items-center gap-2"
        onDoubleClick={onDoubleClick}
      >
        <h1
          className={cn(classNames, className)}
          aria-busy={isGenerating || undefined}
          aria-live={isGenerating ? "polite" : undefined}
          title={isGenerating ? t("session.generatingTitle") : title}
        >
          {title}
        </h1>
        {sessionKind === "long_task" ? (
          <Badge variant="secondary">{t("chat.sessionTypeLongTask")}</Badge>
        ) : sessionKind === "automation" ? (
          <Badge variant="outline">{t("chat.sessionTypeAutomation")}</Badge>
        ) : null}
        {workspaceDir ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground/50 hover:text-foreground -ml-0.5"
                aria-label={t("titleBar.openWorkspace")}
                onClick={handleOpenWorkspace}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("titleBar.openWorkspace")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    );
  }

  return (
    <span
      className={cn("flex min-w-0 items-center gap-2", className)}
      aria-busy={isGenerating || undefined}
      title={isGenerating ? t("session.generatingTitle") : title}
    >
      <span className={classNames}>{title}</span>
      {sessionKind === "long_task" ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-amber-500/70"
          title={t("chat.sessionTypeLongTask")}
        />
      ) : sessionKind === "automation" ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-emerald-500/70"
          title={t("chat.sessionTypeAutomation")}
        />
      ) : null}
    </span>
  );
}
