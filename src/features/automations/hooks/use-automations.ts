import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  subscribeDb,
} from "@/lib/db";
import type {
  AutomationRecord,
  CreateAutomationInput,
  UpdateAutomationInput,
} from "@/lib/db";

import { subscribeAutomationRuns } from "../lib/automation-run-lock";
import { runAutomationById } from "../lib/run-automation";
import type { AutomationViewModel } from "../lib/types";

function toViewModel(
  item: AutomationRecord,
  runningIds: ReadonlySet<string>
): AutomationViewModel {
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

export function useAutomations() {
  const [records, setRecords] = useState<AutomationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const items = useMemo(
    () => records.map((record) => toViewModel(record, runningIds)),
    [records, runningIds]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextRecords = await listAutomations();
      setRecords(nextRecords);
    } catch {
      // Silently handle.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return subscribeAutomationRuns(setRunningIds);
  }, []);

  useEffect(() => {
    void load();
    return subscribeDb(() => {
      void load();
    });
  }, [load]);

  const create = useCallback(
    async (input: CreateAutomationInput): Promise<AutomationRecord> => {
      const record = await createAutomation(input);
      await load();
      return record;
    },
    [load]
  );

  const update = useCallback(
    async (
      id: string,
      patch: UpdateAutomationInput
    ): Promise<AutomationRecord | null> => {
      const record = await updateAutomation(id, patch);
      if (record) {
        await load();
      }
      return record;
    },
    [load]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await deleteAutomation(id);
      if (result) {
        await load();
      }
      return result;
    },
    [load]
  );

  const toggle = useCallback(
    async (id: string, enabled: boolean): Promise<void> => {
      await updateAutomation(id, { enabled });
      await load();
    },
    [load]
  );

  const runNow = useCallback(async (id: string) => {
    return runAutomationById(id);
  }, []);

  return { items, loading, create, update, remove, toggle, runNow } as const;
}
