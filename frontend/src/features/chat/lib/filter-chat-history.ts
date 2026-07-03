import type { ChatHistoryItem } from "@/lib/db";

export type ChatHistoryTimeFilter = "all" | "today" | "week" | "month";

export const CHAT_HISTORY_WORKSPACE_ALL = "all";
export const CHAT_HISTORY_WORKSPACE_NONE = "none";

export type ChatHistoryWorkspaceFilter =
  | typeof CHAT_HISTORY_WORKSPACE_ALL
  | typeof CHAT_HISTORY_WORKSPACE_NONE
  | string;

export type ChatHistoryFilters = {
  time: ChatHistoryTimeFilter;
  workspace: ChatHistoryWorkspaceFilter;
};

export const DEFAULT_CHAT_HISTORY_FILTERS: ChatHistoryFilters = {
  time: "all",
  workspace: CHAT_HISTORY_WORKSPACE_ALL,
};

export function getChatHistoryTimeThreshold(
  filter: ChatHistoryTimeFilter,
  now: number
): number | null {
  switch (filter) {
    case "all":
      return null;
    case "today": {
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      return startOfToday.getTime();
    }
    case "week":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "month":
      return now - 30 * 24 * 60 * 60 * 1000;
  }
}

export function isChatHistoryFiltersActive(filters: ChatHistoryFilters): boolean {
  return (
    filters.time !== "all" ||
    filters.workspace !== CHAT_HISTORY_WORKSPACE_ALL
  );
}

export function collectChatHistoryWorkspaceDirs(
  items: ReadonlyArray<ChatHistoryItem>
): string[] {
  const dirs = new Set<string>();
  for (const item of items) {
    const trimmed = item.workspaceDir?.trim();
    if (trimmed) {
      dirs.add(trimmed);
    }
  }
  return [...dirs].sort((left, right) => left.localeCompare(right));
}

export function filterChatHistoryItems(
  items: ReadonlyArray<ChatHistoryItem>,
  filters: ChatHistoryFilters,
  now = Date.now()
): ChatHistoryItem[] {
  const threshold = getChatHistoryTimeThreshold(filters.time, now);

  return items.filter((item) => {
    if (threshold !== null && item.updatedAt < threshold) {
      return false;
    }

    if (filters.workspace === CHAT_HISTORY_WORKSPACE_ALL) {
      return true;
    }

    const workspaceDir = item.workspaceDir?.trim() ?? "";

    if (filters.workspace === CHAT_HISTORY_WORKSPACE_NONE) {
      return workspaceDir.length === 0;
    }

    return workspaceDir === filters.workspace;
  });
}
