import { useCallback, useEffect, useState } from "react";

import { subscribeDb } from "@/lib/db";
import type {
  ActiveSessionItem,
  AutonomyModeCount,
  DurationBucketItem,
  MessageTrendItem,
  ModelDistributionItem,
  PlatformStats,
  SessionTypeCount,
  TodayStats,
  TokenUsageByDateItem,
  ToolUsageItem,
} from "@/lib/db/stats";
import {
  getActiveSessions,
  getAgentDurationDistribution,
  getMessageTrend,
  getModelDistribution,
  getPlatformStats,
  getSessionTypeDistribution,
  getTodayStats,
  getTokenUsageByDate,
  getToolUsageRanking,
} from "@/lib/db/stats";

export type StatisticsData = {
  platformStats: PlatformStats | null;
  todayStats: TodayStats | null;
  messageTrend: MessageTrendItem[];
  modelDistribution: ModelDistributionItem[];
  sessionTypeKind: SessionTypeCount[];
  sessionTypeMode: AutonomyModeCount[];
  toolRanking: ToolUsageItem[];
  durationDistribution: DurationBucketItem[];
  tokenUsageByDate: TokenUsageByDateItem[];
  activeSessions: ActiveSessionItem[];
  loading: boolean;
};

export function useStats(): StatisticsData {
  const [data, setData] = useState<StatisticsData>({
    platformStats: null,
    todayStats: null,
    messageTrend: [],
    modelDistribution: [],
    sessionTypeKind: [],
    sessionTypeMode: [],
    toolRanking: [],
    durationDistribution: [],
    tokenUsageByDate: [],
    activeSessions: [],
    loading: true,
  });

  const load = useCallback(async () => {
    const [
      platformStats,
      todayStats,
      messageTrend,
      modelDistribution,
      sessionTypeDist,
      toolRanking,
      durationDistribution,
      tokenUsageByDate,
      activeSessions,
    ] = await Promise.all([
      getPlatformStats(),
      getTodayStats(),
      getMessageTrend(30),
      getModelDistribution(),
      getSessionTypeDistribution(),
      getToolUsageRanking(10),
      getAgentDurationDistribution(),
      getTokenUsageByDate(365),
      getActiveSessions(10),
    ]);

    setData({
      platformStats,
      todayStats,
      messageTrend,
      modelDistribution,
      sessionTypeKind: sessionTypeDist.sessionKind,
      sessionTypeMode: sessionTypeDist.autonomyMode,
      toolRanking,
      durationDistribution,
      tokenUsageByDate,
      activeSessions,
      loading: false,
    });
  }, []);

  useEffect(() => {
    void load();
    const unsub = subscribeDb(() => {
      void load();
    });
    return unsub;
  }, [load]);

  return data;
}
