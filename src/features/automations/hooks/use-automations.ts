import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

  // Separate initial load from background refreshes so chat streaming
  // doesn't flash a loading state on every DB change.
  const initialLoad = useCallback(async () => {
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

  const refresh = useCallback(async () => {
    try {
      const nextRecords = await listAutomations();
      setRecords(nextRecords);
    } catch {
      // Silently handle.
    }
  }, []);

  // Debounce the background refresh — coalesce rapid DB changes
  // (e.g. streaming message chunks) into a single reload.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      void refresh();
    }, 300);
  }, [refresh]);

  // Clean up the debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeAutomationRuns(setRunningIds);
  }, []);

  useEffect(() => {
    void initialLoad();
    return subscribeDb(() => {
      scheduleRefresh();
    });
  }, [initialLoad, scheduleRefresh]);

  const create = useCallback(
    async (input: CreateAutomationInput): Promise<AutomationRecord> => {
      const record = await createAutomation(input);
      // Sync immediately (not debounced) after the user's own mutation.
      void refresh();
      return record;
    },
    [refresh]
  );

  const update = useCallback(
    async (
      id: string,
      patch: UpdateAutomationInput
    ): Promise<AutomationRecord | null> => {
      const record = await updateAutomation(id, patch);
      if (record) {
        void refresh();
      }
      return record;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await deleteAutomation(id);
      if (result) {
        void refresh();
      }
      return result;
    },
    [refresh]
  );

  const toggle = useCallback(
    async (id: string, enabled: boolean): Promise<void> => {
      await updateAutomation(id, { enabled });
      void refresh();
    },
    [refresh]
  );

  const runNow = useCallback(async (id: string) => {
    return runAutomationById(id);
  }, []);

  return { items, loading, create, update, remove, toggle, runNow } as const;
}
