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

const RUNNING_POLL_MS = 3_000;

function toViewModel(
  item: ScheduledJobRecord,
  runningIds: ReadonlySet<string>
): ScheduledJobViewModel {
  return {
    ...item,
    running: runningIds.has(item.id),
  };
}

export function useScheduledJobs() {
  const [records, setRecords] = useState<ScheduledJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const items = useMemo(
    () => records.map((record) => toViewModel(record, runningIds)),
    [records, runningIds]
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
