import { useTranslation } from "@/lib/i18n/locale-provider";
import { useStats } from "../hooks/use-stats";
import { TokenHeatmap } from "../components/token-heatmap";
import {
  GitCommitHorizontal,
  MessageCircle,
  Bot,
  Zap,
} from "lucide-react";

const statsConfig = [
  {
    labelKey: "sessionCount" as const,
    icon: GitCommitHorizontal,
    barColor: "bg-emerald-500",
    iconColor: "text-emerald-500",
    valueColor: "text-emerald-500",
  },
  {
    labelKey: "messageCount" as const,
    icon: MessageCircle,
    barColor: "bg-orange-500",
    iconColor: "text-orange-500",
    valueColor: "text-orange-500",
  },
  {
    labelKey: "agentRunCount" as const,
    icon: Bot,
    barColor: "bg-cyan-500",
    iconColor: "text-cyan-500",
    valueColor: "text-cyan-500",
  },
  {
    labelKey: "totalTokens" as const,
    icon: Zap,
    barColor: "bg-amber-500",
    iconColor: "text-amber-500",
    valueColor: "text-amber-500",
  },
] as const;

const modelAccentColors = [
  "bg-emerald-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-violet-500",
];

const toolBarColors = [
  "bg-emerald-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-lime-500",
];

export function StatisticsPage() {
  const { t } = useTranslation();
  const {
    platformStats,
    tokenUsageByDate,
    toolRanking,
    modelDistribution,
    loading,
  } = useStats();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-56 animate-pulse rounded bg-muted" />
          <div className="mx-auto h-48 w-full max-w-3xl animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  const stats = platformStats;
  const maxToolCount = Math.max(...toolRanking.map((t) => t.count), 1);

  const statValues = [
    stats?.sessionCount ?? 0,
    stats?.messageCount ?? 0,
    stats?.agentRunCount ?? 0,
    stats ? stats.totalTokens.toLocaleString() : "0",
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1340px] px-7 pb-10 pt-8">
        {/* ── Header ── */}
        <header className="mb-9 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/app-icon.png"
              alt="Coder"
              className="h-11 w-11 rounded-xl object-cover shadow-sm"
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {t("pages.statistics.title")}
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                {t("statistics.description")}
              </p>
            </div>
          </div>
        </header>

        {/* ── Stat cards ── */}
        <div className="mb-7 grid grid-cols-4 gap-4">
          {statsConfig.map((cfg, i) => {
            const Icon = cfg.icon;
            return (
              <div
                key={cfg.labelKey}
                className="stat-card group relative overflow-hidden rounded-[10px] border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5"
              >
                {/* Colored top bar */}
                <div
                  className={`absolute left-0 right-0 top-0 h-0.5 ${cfg.barColor}`}
                />
                {/* Label with icon */}
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Icon className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
                  {t(`statistics.${cfg.labelKey}`)}
                </div>
                {/* Value */}
                <div
                  className={`text-[32px] font-bold tabular-nums leading-none ${cfg.valueColor}`}
                >
                  {statValues[i]}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Heatmap ── */}
        <section className="mb-7">
          <div className="stat-card group relative overflow-hidden rounded-[10px] border bg-card transition-all duration-200">
            {/* Animated gradient top bar */}
            <div
              className="absolute left-0 right-0 top-0 h-0.5"
              style={{
                background:
                  "linear-gradient(90deg, #10b981, #06b6d4, #10b981)",
                backgroundSize: "200% 100%",
                animation: "heatmap-shimmer 4s linear infinite",
              }}
            />
            <div className="p-6 pt-5">
              <TokenHeatmap data={tokenUsageByDate} />
            </div>
          </div>
        </section>

        {/* ── Two column ── */}
        <div className="grid grid-cols-2 gap-5">
          {/* Tool ranking */}
          <div className="rounded-[10px] border bg-card p-6">
            <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold">
              <span className="text-emerald-500">🔧</span>
              {t("statistics.toolRanking")}
            </h3>
            <div className="flex flex-col gap-3.5">
              {toolRanking.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("statistics.noData")}
                </p>
              )}
              {toolRanking.map((tool, i) => (
                <div key={tool.name} className="flex items-center gap-3">
                  <span className="w-[90px] shrink-0 truncate text-right font-mono text-xs text-muted-foreground">
                    {tool.name}
                  </span>
                  <div className="flex-1 overflow-hidden rounded-md bg-muted">
                    <div
                      className={`h-6 rounded-md transition-all duration-1000 ${toolBarColors[i % toolBarColors.length]}`}
                      style={{
                        width: `${(tool.count / maxToolCount) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-xs font-semibold text-muted-foreground">
                    {tool.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Model distribution */}
          <div className="rounded-[10px] border bg-card p-6">
            <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold">
              <span className="text-orange-500">🧠</span>
              {t("statistics.modelDistribution")}
            </h3>
            <div className="flex flex-col gap-3.5">
              {modelDistribution.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("statistics.noData")}
                </p>
              )}
              {modelDistribution.map((m, i) => (
                <div key={m.model} className="flex items-center gap-3">
                  <div
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${modelAccentColors[i % modelAccentColors.length]}`}
                  />
                  <span className="w-24 shrink-0 text-xs">{m.model}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full transition-all duration-1000 ${modelAccentColors[i % modelAccentColors.length]}`}
                      style={{ width: `${m.percentage}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {m.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
