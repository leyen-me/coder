import { Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { ScheduledJobRunRecord } from "@/features/scheduled-jobs/lib/types";
import { cn } from "@/lib/utils";

type AutomationRunListProps = {
  runs: ScheduledJobRunRecord[];
};

const statusConfig = {
  running: {
    dotClass: "bg-primary shadow-[0_0_0_3px] shadow-primary/15",
    badgeClass: "text-primary bg-primary/10",
  },
  completed: {
    dotClass: "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/15",
    badgeClass:
      "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50",
  },
  failed: {
    dotClass: "bg-red-500 shadow-[0_0_0_3px] shadow-red-500/15",
    badgeClass: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50",
  },
  cancelled: {
    dotClass:
      "bg-muted-foreground/40 shadow-[0_0_0_3px] shadow-muted-foreground/10",
    badgeClass: "text-muted-foreground bg-muted",
  },
} as const;

export function AutomationRunList({ runs }: AutomationRunListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = useCallback(
    (sessionId: string) => {
      if (sessionId.trim()) {
        navigate(paths.chat(sessionId));
      }
    },
    [navigate]
  );

  if (runs.length === 0) {
    return null;
  }

  return (
    <ul>
      {runs.map((run, index) => {
        const statusLabel = t(`automations.runStatus.${run.status}`);
        const timeLabel = new Date(
          run.completedAt ?? run.startedAt
        ).toLocaleString();
        const canOpenSession = run.sessionId.trim().length > 0;
        const config = statusConfig[run.status];

        return (
          <li key={run.id}>
            <div
              role={canOpenSession ? "button" : undefined}
              tabIndex={canOpenSession ? 0 : undefined}
              onClick={() => handleClick(run.sessionId)}
              onKeyDown={
                canOpenSession
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleClick(run.sessionId);
                      }
                    }
                  : undefined
              }
              className={cn(
                "group flex items-start gap-3 px-3 py-3 transition-colors duration-150",
                canOpenSession &&
                  "cursor-pointer rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              )}
            >
              <div
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  config.dotClass
                )}
              />

              <div className="min-w-0 flex-1 space-y-1">
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
                  {run.sessionId.trim() ? (
                    <span className="text-xs text-muted-foreground">
                      {t("automations.runCreatesSession")}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {index < runs.length - 1 ? (
              <div className="mx-3 border-b border-border/40" />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
