import { useCallback, useEffect, useState } from "react";

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

import type { AutomationViewModel } from "../lib/types";

function toViewModel(item: AutomationRecord): AutomationViewModel {
  return {
    ...item,
    relativeTime: formatRelativeTime(item.updatedAt),
    running: false,
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
  const [items, setItems] = useState<AutomationViewModel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const records = await listAutomations();
      setItems(records.map(toViewModel));
    } catch {
      // Silently handle.
    } finally {
      setLoading(false);
    }
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

  return { items, loading, create, update, remove, toggle } as const;
}
