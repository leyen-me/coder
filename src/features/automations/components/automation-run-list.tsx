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

const statusClassName: Record<AutomationRunRecord["status"], string> = {
  running: "text-primary",
  completed: "text-muted-foreground",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};

export function AutomationRunList({ runs }: AutomationRunListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("automations.runHistoryEmpty")}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {runs.map((run) => {
        const statusLabel = t(`automations.runStatus.${run.status}`);
        const timeLabel = new Date(
          run.completedAt ?? run.startedAt
        ).toLocaleString();
        const canOpenSession = run.sessionId.trim().length > 0;

        return (
          <li
            key={run.id}
            className="rounded-xl border border-border/50 px-3 py-2.5 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-muted-foreground">
                    {timeLabel}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium",
                      statusClassName[run.status]
                    )}
                  >
                    {run.status === "running" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : null}
                    {statusLabel}
                  </span>
                </div>
                {run.summary ? (
                  <p className="line-clamp-3 text-xs text-muted-foreground">
                    {run.summary}
                  </p>
                ) : run.status === "running" ? (
                  <p className="text-xs text-muted-foreground">
                    {t("automations.running")}
                  </p>
                ) : null}
              </div>

              {canOpenSession ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2"
                  onClick={() => navigate(paths.chat(run.sessionId))}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  {t("automations.viewSession")}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
