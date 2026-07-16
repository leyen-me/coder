import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createScheduledJob,
  deleteScheduledJob,
  listRunningScheduledJobIds,
  listScheduledJobs,
  runScheduledJobNow,
  toggleScheduledJob,
  updateScheduledJob,
  type CreateScheduledJobInput,
  type ScheduledJobRecord,
  type UpdateScheduledJobInput,
} from "../lib/api";
import type { ScheduledJobViewModel } from "../lib/types";
import { useTranslation } from "@/lib/i18n/locale-provider";

const RUNNING_POLL_MS = 3_000;

function toViewModel(
  item: ScheduledJobRecord,
  runningIds: ReadonlySet<string>,
  formatRelativeTime: (timestamp: number) => string
): ScheduledJobViewModel {
  return {
    ...item,
    relativeTime: formatRelativeTime(item.updatedAt),
    running: runningIds.has(item.id),
  };
}

export function useScheduledJobs() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<ScheduledJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const formatRelativeTime = useCallback(
    (timestamp: number) => {
      const diffMs = Date.now() - timestamp;
      const diffMin = Math.round(diffMs / 60_000);

      if (diffMin < 1) return t("time.justNow");
      if (diffMin < 60) return t("time.minutesAgo", { count: diffMin });
      const diffHours = Math.round(diffMin / 60);
      if (diffHours < 24) return t("time.hoursAgo", { count: diffHours });
      const diffDays = Math.round(diffHours / 24);
      if (diffDays < 7) return t("time.daysAgo", { count: diffDays });
      const diffWeeks = Math.round(diffDays / 7);
      if (diffWeeks < 5) return t("time.weeksAgo", { count: diffWeeks });
      const diffMonths = Math.round(diffDays / 30);
      return t("time.monthsAgo", { count: diffMonths });
    },
    [t]
  );

  const items = useMemo(
    () => records.map((record) => toViewModel(record, runningIds, formatRelativeTime)),
    [records, runningIds, formatRelativeTime]
  );

  const refresh = useCallback(async () => {
    try {
      const [nextRecords, running] = await Promise.all([
        listScheduledJobs(),
        listRunningScheduledJobIds(),
      ]);
      setRecords(nextRecords);
      setRunningIds(new Set(running));
    } catch {
      // Best-effort background refresh.
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      try {
        await refresh();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, RUNNING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const create = useCallback(
    async (input: CreateScheduledJobInput): Promise<ScheduledJobRecord> => {
      const record = await createScheduledJob(input);
      await refresh();
      return record;
    },
    [refresh]
  );

  const update = useCallback(
    async (
      id: string,
      patch: UpdateScheduledJobInput
    ): Promise<ScheduledJobRecord> => {
      const record = await updateScheduledJob(id, patch);
      await refresh();
      return record;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteScheduledJob(id);
      await refresh();
    },
    [refresh]
  );

  const toggle = useCallback(
    async (id: string, enabled: boolean): Promise<void> => {
      await toggleScheduledJob(id, enabled);
      await refresh();
    },
    [refresh]
  );

  const runNow = useCallback(
    async (id: string): Promise<"started" | "already_running"> => {
      const result = await runScheduledJobNow(id);
      await refresh();
      return result;
    },
    [refresh]
  );

  return { items, loading, create, update, remove, toggle, runNow, refresh } as const;
}
