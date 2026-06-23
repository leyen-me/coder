import { useCallback, useEffect, useState } from "react";

import { subscribeDb } from "@/lib/db";
import type {
  ActiveSessionItem,
  DurationBucketItem,
  ModelDistributionItem,
  PlatformStats,
  SessionTypeCount,
  TokenUsageByDateItem,
  ToolUsageItem,
} from "@/lib/db/stats";
import {
  getActiveSessions,
  getAgentDurationDistribution,
  getModelDistribution,
  getPlatformStats,
  getSessionTypeDistribution,
  getTokenUsageByDate,
  getToolUsageRanking,
} from "@/lib/db/stats";

export type StatisticsData = {
  platformStats: PlatformStats | null;
  tokenUsageByDate: TokenUsageByDateItem[];
  toolRanking: ToolUsageItem[];
  modelDistribution: ModelDistributionItem[];
  activeSessions: ActiveSessionItem[];
  durationDistribution: DurationBucketItem[];
  sessionKind: SessionTypeCount[];
  loading: boolean;
};

export function useStats(): StatisticsData {
  const [data, setData] = useState<StatisticsData>({
    platformStats: null,
    tokenUsageByDate: [],
    toolRanking: [],
    modelDistribution: [],
    activeSessions: [],
    durationDistribution: [],
    sessionKind: [],
    loading: true,
  });

  const load = useCallback(async () => {
    const [
      platformStats,
      tokenUsageByDate,
      toolRanking,
      modelDistribution,
      activeSessions,
      durationDistribution,
      sessionDist,
    ] = await Promise.all([
      getPlatformStats(),
      getTokenUsageByDate(365),
      getToolUsageRanking(6),
      getModelDistribution(),
      getActiveSessions(5),
      getAgentDurationDistribution(),
      getSessionTypeDistribution(),
    ]);

    setData({
      platformStats,
      tokenUsageByDate,
      toolRanking,
      modelDistribution: modelDistribution.slice(0, 6),
      activeSessions,
      durationDistribution,
      sessionKind: sessionDist.sessionKind,
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
