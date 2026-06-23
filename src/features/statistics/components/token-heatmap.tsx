import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { TokenUsageByDateItem } from "@/lib/db/stats";
import {
  ActivityCalendar,
  type Activity,
} from "react-activity-calendar";
import "react-activity-calendar/tooltips.css";
import { Flame } from "lucide-react";

type Props = { data: TokenUsageByDateItem[] };

function getLevel(tokens: number): number {
  if (tokens === 0) return 0;
  if (tokens < 1_000) return 1;
  if (tokens < 10_000) return 2;
  if (tokens < 100_000) return 3;
  return 4;
}

const LIGHT_THEME = [
  "hsl(0, 0%, 92%)",
  "hsl(143, 37%, 76%)",
  "hsl(143, 47%, 60%)",
  "hsl(143, 57%, 44%)",
  "hsl(143, 67%, 30%)",
];

const DARK_THEME = [
  "hsl(0, 0%, 20%)",
  "hsl(143, 30%, 25%)",
  "hsl(143, 40%, 35%)",
  "hsl(143, 50%, 45%)",
  "hsl(143, 60%, 55%)",
];

export function TokenHeatmap({ data }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [blockSize, setBlockSize] = useState(13);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const cols = 53;
    const margin = 3;
    const gridWidth = Math.max(width - 40, 200);
    const computed = Math.floor(gridWidth / cols - margin);
    setBlockSize(Math.max(8, Math.min(computed, 20)));
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

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
      <div className="mb-4 flex items-center gap-2 text-sm font-medium">
        <Flame className="h-4 w-4 text-primary" />
        <span>{t("statistics.tokenHeatmap")}</span>
      </div>
      <div ref={containerRef} className="heatmap-svg w-full">
        <ActivityCalendar
          data={activities}
          theme={{ light: isDark ? DARK_THEME : LIGHT_THEME, dark: isDark ? DARK_THEME : LIGHT_THEME }}
          labels={labels}
          tooltips={{
            activity: {
              text: (activity) =>
                `${activity.date} — ${activity.count.toLocaleString()} ${t("statistics.tokens")}`,
            },
          }}
          showWeekdayLabels
          showTotalCount={false}
          blockSize={blockSize}
          blockMargin={3}
          blockRadius={2}
          fontSize={Math.max(10, Math.min(12, blockSize - 1))}
        />
      </div>
    </>
  );
}
