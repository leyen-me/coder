import { describe, expect, it } from "vitest";

import {
  normalizeSessionTitle,
  parseTitleFromCompletionBody,
} from "./generate-session-title";

describe("normalizeSessionTitle", () => {
  it("strips surrounding quotes and collapses whitespace", () => {
    expect(normalizeSessionTitle('  "修复登录 Bug"  ')).toBe("修复登录 Bug");
  });

  it("truncates long titles", () => {
    const long = "a".repeat(60);
    expect(normalizeSessionTitle(long)).toHaveLength(48);
    expect(normalizeSessionTitle(long).endsWith("…")).toBe(true);
  });

  it("strips redacted thinking blocks from provider output", () => {
    expect(
      normalizeSessionTitle(
        `<${"think"}>internal reasoning</${"think"}>Fix login bug`
      )
    ).toBe("Fix login bug");
  });
});

describe("parseTitleFromCompletionBody", () => {
  it("reads message content", () => {
    expect(
      parseTitleFromCompletionBody({
        choices: [{ message: { content: "重构 auth 模块" } }],
      })
    ).toBe("重构 auth 模块");
  });

  it("returns null for empty or invalid payloads", () => {
    expect(parseTitleFromCompletionBody({})).toBeNull();
    expect(parseTitleFromCompletionBody({ choices: [] })).toBeNull();
  });
});
