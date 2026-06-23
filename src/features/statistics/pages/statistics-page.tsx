import { useTranslation } from "@/lib/i18n/locale-provider";
import { useStats } from "../hooks/use-stats";
import { StatCard } from "../components/stat-card";
import { TodayActivityCards } from "../components/today-activity-cards";
import { MessageTrendChart } from "../components/message-trend-chart";
import { ModelPieChart } from "../components/model-pie-chart";
import { SessionTypeChart } from "../components/session-type-chart";
import { ToolRankingChart } from "../components/tool-ranking-chart";
import { DurationChart } from "../components/duration-chart";
import { TokenHeatmap } from "../components/token-heatmap";
import { ActiveSessionsTable } from "../components/active-sessions-table";

export function StatisticsPage() {
  const { t } = useTranslation();
  const {
    platformStats,
    todayStats,
    messageTrend,
    modelDistribution,
    sessionTypeKind,
    sessionTypeMode,
    toolRanking,
    durationDistribution,
    tokenUsageByDate,
    activeSessions,
    loading,
  } = useStats();

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("pages.statistics.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("statistics.description")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            📊 {t("pages.statistics.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("statistics.description")}
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label={t("statistics.sessionCount")}
            value={platformStats?.sessionCount ?? 0}
          />
          <StatCard
            label={t("statistics.messageCount")}
            value={platformStats?.messageCount ?? 0}
          />
          <StatCard
            label={t("statistics.agentRunCount")}
            value={platformStats?.agentRunCount ?? 0}
          />
          <StatCard
            label={t("statistics.totalTokens")}
            value={
              platformStats
                ? platformStats.totalTokens.toLocaleString()
                : "0"
            }
          />
        </div>

        {/* Today Activity */}
        <TodayActivityCards stats={todayStats} />

        {/* Charts Row 1 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <MessageTrendChart data={messageTrend} />
          <ModelPieChart data={modelDistribution} />
        </div>

        {/* Charts Row 2 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ToolRankingChart data={toolRanking} />
          <DurationChart data={durationDistribution} />
        </div>

        {/* Session Type Distribution */}
        <SessionTypeChart
          sessionKind={sessionTypeKind}
          autonomyMode={sessionTypeMode}
        />

        {/* Token Heatmap */}
        <TokenHeatmap data={tokenUsageByDate} />

        {/* Active Sessions */}
        <ActiveSessionsTable data={activeSessions} />
      </div>
    </div>
  );
}
