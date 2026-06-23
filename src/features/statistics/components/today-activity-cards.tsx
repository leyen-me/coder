import type { TodayStats } from "@/lib/db/stats";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { StatCard } from "./stat-card";

type Props = { stats: TodayStats | null };

function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function TodayActivityCards({ stats }: Props) {
  const { t } = useTranslation();

  if (!stats) return null;

  const items = [
    { label: t("statistics.todayMessages"), value: stats.todayMessages },
    { label: t("statistics.weekMessages"), value: stats.weekMessages },
    { label: t("statistics.todayTokens"), value: formatNumber(stats.todayTokens) },
    { label: t("statistics.todaySessions"), value: stats.todaySessions },
    { label: t("statistics.activeModel"), value: stats.topModel },
    { label: t("statistics.avgDuration"), value: formatDuration(stats.avgDuration) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}
