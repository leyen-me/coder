import { ExternalLink, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { AutomationRunRecord } from "@/lib/db";
import { cn } from "@/lib/utils";

type AutomationRunListProps = {
  runs: AutomationRunRecord[];
};

const statusConfig = {
  running: {
    dotClass: "bg-primary shadow-[0_0_0_3px] shadow-primary/15",
    badgeClass: "text-primary bg-primary/10",
  },
  completed: {
    dotClass: "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/15",
    badgeClass: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50",
  },
  failed: {
    dotClass: "bg-red-500 shadow-[0_0_0_3px] shadow-red-500/15",
    badgeClass: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50",
  },
  cancelled: {
    dotClass: "bg-muted-foreground/40 shadow-[0_0_0_3px] shadow-muted-foreground/10",
    badgeClass: "text-muted-foreground bg-muted",
  },
} as const;

export function AutomationRunList({ runs }: AutomationRunListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (runs.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-1">
      {runs.map((run, i) => {
        const statusLabel = t(`automations.runStatus.${run.status}`);
        const timeLabel = new Date(
          run.completedAt ?? run.startedAt
        ).toLocaleString();
        const canOpenSession = run.sessionId.trim().length > 0;
        const config = statusConfig[run.status];

        return (
          <li
            key={run.id}
            className={cn(
              "group flex items-start gap-3 rounded-lg px-3 py-3 transition-colors duration-150",
              "hover:bg-accent/30",
              "animate-[fadeSlideIn_0.3s_ease_both]"
            )}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            {/* Status dot */}
            <div
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", config.dotClass)}
            />

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-1">
              {/* Summary text */}
              {run.summary ? (
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground">
                  {run.summary}
                </p>
              ) : run.status === "running" ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t("automations.running")}
                </p>
              ) : null}

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2">
                <time className="text-xs tabular-nums text-muted-foreground/70">
                  {timeLabel}
                </time>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-normal",
                    config.badgeClass
                  )}
                >
                  {run.status === "running" ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : null}
                  {statusLabel}
                </span>
              </div>
            </div>

            {/* Action */}
            {canOpenSession ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "mt-0.5 h-7 shrink-0 whitespace-nowrap px-2.5 text-xs font-medium",
                  "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                  "focus-visible:opacity-100"
                )}
                onClick={() => navigate(paths.chat(run.sessionId))}
              >
                <ExternalLink className="mr-1 size-3" />
                {t("automations.viewSession")}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
