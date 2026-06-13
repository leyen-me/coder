import { describe, expect, it } from "vitest";

import type { ChatHistoryItem } from "@/lib/db";

import {
  CHAT_HISTORY_WORKSPACE_ALL,
  CHAT_HISTORY_WORKSPACE_NONE,
  filterChatHistoryItems,
  getChatHistoryTimeThreshold,
} from "./filter-chat-history";

function item(
  overrides: Partial<ChatHistoryItem> & Pick<ChatHistoryItem, "id">
): ChatHistoryItem {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    relativeTime: "1h",
    updatedAt: overrides.updatedAt ?? 0,
    workspaceDir: overrides.workspaceDir ?? null,
    sessionKind: overrides.sessionKind ?? "standard",
  };
}

describe("filterChatHistoryItems", () => {
  const now = new Date("2026-06-11T15:00:00").getTime();
  const startOfToday = new Date("2026-06-11T00:00:00").getTime();

  const items = [
    item({
      id: "today-workspace",
      updatedAt: startOfToday + 1,
      workspaceDir: "/workspace/a",
    }),
    item({
      id: "week-no-workspace",
      updatedAt: now - 2 * 24 * 60 * 60 * 1000,
      workspaceDir: null,
    }),
    item({
      id: "old-workspace",
      updatedAt: now - 40 * 24 * 60 * 60 * 1000,
      workspaceDir: "/workspace/b",
    }),
  ];

  it("returns all items when filters are default", () => {
    expect(
      filterChatHistoryItems(items, {
        time: "all",
        workspace: CHAT_HISTORY_WORKSPACE_ALL,
      }, now)
    ).toHaveLength(3);
  });

  it("filters by time", () => {
    expect(
      filterChatHistoryItems(items, { time: "today", workspace: CHAT_HISTORY_WORKSPACE_ALL }, now)
    ).toEqual([items[0]]);
  });

  it("filters by workspace", () => {
    expect(
      filterChatHistoryItems(items, {
        time: "all",
        workspace: CHAT_HISTORY_WORKSPACE_NONE,
      }, now)
    ).toEqual([items[1]]);
  });

  it("combines time and workspace filters", () => {
    expect(
      filterChatHistoryItems(items, {
        time: "week",
        workspace: "/workspace/a",
      }, now)
    ).toEqual([items[0]]);
  });
});

describe("getChatHistoryTimeThreshold", () => {
  const now = new Date("2026-06-11T15:00:00").getTime();

  it("returns null for all time", () => {
    expect(getChatHistoryTimeThreshold("all", now)).toBeNull();
  });

  it("returns start of local day for today", () => {
    expect(getChatHistoryTimeThreshold("today", now)).toBe(
      new Date("2026-06-11T00:00:00").getTime()
    );
  });
});
