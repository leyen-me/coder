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

function toViewModel(
  item: ScheduledJobRecord,
  runningIds: ReadonlySet<string>,
): ScheduledJobViewModel {
  return {
    ...item,
    relativeTime: formatRelativeTime(item.updatedAt),
    running: runningIds.has(item.id),
  };
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.round(diffDays / 30);
  return `${diffMonths}mo ago`;
}

const RUNNING_POLL_MS = 3_000;

export function useScheduledJobs() {
  const [records, setRecords] = useState<ScheduledJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const items = useMemo(
    () => records.map((record) => toViewModel(record, runningIds)),
    [records, runningIds],
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
      // Silently handle.
    }
  }, []);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void initialLoad();
  }, [initialLoad]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, RUNNING_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const create = useCallback(
    async (input: CreateScheduledJobInput): Promise<ScheduledJobRecord> => {
      const record = await createScheduledJob(input);
      await refresh();
      return record;
    },
    [refresh],
  );

  const update = useCallback(
    async (
      id: string,
      patch: UpdateScheduledJobInput,
    ): Promise<ScheduledJobRecord> => {
      const record = await updateScheduledJob(id, patch);
      await refresh();
      return record;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      await deleteScheduledJob(id);
      await refresh();
      return true;
    },
    [refresh],
  );

  const toggle = useCallback(
    async (id: string, enabled: boolean): Promise<void> => {
      await toggleScheduledJob(id, enabled);
      await refresh();
    },
    [refresh],
  );

  const runNow = useCallback(
    async (id: string) => {
      const result = await runScheduledJobNow(id);
      await refresh();
      return result;
    },
    [refresh],
  );

  return { items, loading, create, update, remove, toggle, runNow } as const;
}
