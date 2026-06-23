import { useCallback, useEffect, useState } from "react";

import { subscribeDb } from "@/lib/db";
import type {
  ModelDistributionItem,
  PlatformStats,
  TokenUsageByDateItem,
  ToolUsageItem,
} from "@/lib/db/stats";
import {
  getModelDistribution,
  getPlatformStats,
  getTokenUsageByDate,
  getToolUsageRanking,
} from "@/lib/db/stats";

export type StatisticsData = {
  platformStats: PlatformStats | null;
  tokenUsageByDate: TokenUsageByDateItem[];
  toolRanking: ToolUsageItem[];
  modelDistribution: ModelDistributionItem[];
  loading: boolean;
};

export function useStats(): StatisticsData {
  const [data, setData] = useState<StatisticsData>({
    platformStats: null,
    tokenUsageByDate: [],
    toolRanking: [],
    modelDistribution: [],
    loading: true,
  });

  const load = useCallback(async () => {
    const [platformStats, tokenUsageByDate, toolRanking, modelDistribution] =
      await Promise.all([
        getPlatformStats(),
        getTokenUsageByDate(365),
        getToolUsageRanking(6),
        getModelDistribution(),
      ]);

    setData({
      platformStats,
      tokenUsageByDate,
      toolRanking,
      modelDistribution: modelDistribution.slice(0, 6),
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
