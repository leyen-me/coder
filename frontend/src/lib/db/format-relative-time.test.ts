import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/lib/db/format-relative-time";

const labels = {
  justNow: "刚刚",
  minutesAgo: (count: number) => `${count} 分钟前`,
  hoursAgo: (count: number) => `${count} 小时前`,
  daysAgo: (count: number) => `${count} 天前`,
  weeksAgo: (count: number) => `${count} 周前`,
  monthsAgo: (count: number) => `${count} 个月前`,
};

describe("formatRelativeTime", () => {
  it("returns just now for recent timestamps", () => {
    expect(formatRelativeTime(Date.now() - 10_000, Date.now(), labels)).toBe(
      "刚刚"
    );
  });

  it("returns minutes ago for timestamps within an hour", () => {
    expect(
      formatRelativeTime(Date.now() - 5 * 60_000, Date.now(), labels)
    ).toBe("5 分钟前");
  });
});
