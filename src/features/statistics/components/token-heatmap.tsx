import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { TokenUsageByDateItem } from "@/lib/db/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActivityCalendar,
  type Activity,
} from "react-activity-calendar";
import "react-activity-calendar/tooltips.css";

type Props = { data: TokenUsageByDateItem[] };

/** Map raw token count to a 0–4 activity level. */
function getLevel(tokens: number): number {
  if (tokens === 0) return 0;
  if (tokens < 1_000) return 1;
  if (tokens < 10_000) return 2;
  if (tokens < 100_000) return 3;
  return 4;
}

export function TokenHeatmap({ data }: Props) {
  const { t } = useTranslation();

  // Pad data to cover the full 365-day window so the calendar renders correctly.
  // react-activity-calendar determines the visible range from the data; without
  // entries for empty dates the calendar may show a narrow window.
  const activities: Activity[] = useMemo(() => {
    const dataMap = new Map(data.map((d) => [d.date, d.totalTokens]));

    const result: Activity[] = [];
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 364);

    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const tokens = dataMap.get(dateStr) ?? 0;
      result.push({
        date: dateStr,
        count: tokens,
        level: getLevel(tokens),
      });
    }
    return result;
  }, [data]);

  const labels = useMemo(
    () => ({
      legend: {
        less: t("statistics.less"),
        more: t("statistics.more"),
      },
    }),
    [t]
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            🔥 {t("statistics.tokenHeatmap")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("statistics.noData")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          🔥 {t("statistics.tokenHeatmap")}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
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
          blockSize={12}
          blockMargin={3}
          blockRadius={2}
          fontSize={12}
        />
      </CardContent>
    </Card>
  );
}
