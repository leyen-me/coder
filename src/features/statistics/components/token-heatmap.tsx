import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { TokenUsageByDateItem } from "@/lib/db/stats";
import {
  ActivityCalendar,
  type Activity,
} from "react-activity-calendar";
import "react-activity-calendar/tooltips.css";

type Props = { data: TokenUsageByDateItem[] };

function getLevel(tokens: number): number {
  if (tokens === 0) return 0;
  if (tokens < 1_000) return 1;
  if (tokens < 10_000) return 2;
  if (tokens < 100_000) return 3;
  return 4;
}

export function TokenHeatmap({ data }: Props) {
  const { t } = useTranslation();

  const activities: Activity[] = useMemo(() => {
    const dataMap = new Map(data.map((d) => [d.date, d.totalTokens]));
    const result: Activity[] = [];
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 364);
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const tokens = dataMap.get(dateStr) ?? 0;
      result.push({ date: dateStr, count: tokens, level: getLevel(tokens) });
    }
    return result;
  }, [data]);

  const labels = useMemo(
    () => ({ legend: { less: t("statistics.less"), more: t("statistics.more") } }),
    [t]
  );

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("statistics.noData")}
      </p>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-primary">🔥</span>
          <span>{t("statistics.tokenHeatmap")}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("statistics.less")}</span>
          <div className="h-3 w-3 rounded-sm border" style={{ background: "hsl(0, 0%, 92%)" }} />
          <div className="h-3 w-3 rounded-sm border" style={{ background: "hsl(143, 37%, 76%)" }} />
          <div className="h-3 w-3 rounded-sm border" style={{ background: "hsl(143, 47%, 60%)" }} />
          <div className="h-3 w-3 rounded-sm border" style={{ background: "hsl(143, 57%, 44%)" }} />
          <div className="h-3 w-3 rounded-sm border" style={{ background: "hsl(143, 67%, 30%)" }} />
          <span>{t("statistics.more")}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <ActivityCalendar
          data={activities}
          theme={{
            light: [
              "hsl(0, 0%, 92%)",
              "hsl(143, 37%, 76%)",
              "hsl(143, 47%, 60%)",
              "hsl(143, 57%, 44%)",
              "hsl(143, 67%, 30%)",
            ],
            dark: [
              "hsl(0, 0%, 20%)",
              "hsl(143, 30%, 25%)",
              "hsl(143, 40%, 35%)",
              "hsl(143, 50%, 45%)",
              "hsl(143, 60%, 55%)",
            ],
          }}
          labels={labels}
          tooltips={{
            activity: {
              text: (activity) =>
                `${activity.date} — ${activity.count.toLocaleString()} ${t("statistics.tokens")}`,
            },
          }}
          showWeekdayLabels
          showTotalCount={false}
          blockSize={13}
          blockMargin={4}
          blockRadius={3}
          fontSize={12}
        />
      </div>
    </>
  );
}
