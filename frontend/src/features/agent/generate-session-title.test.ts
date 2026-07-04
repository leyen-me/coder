import { describe, expect, it, vi } from "vitest";

import { apiPost } from "@/lib/api/client";
import { updateSessionTitle } from "@/lib/db";

import {
  normalizeSessionTitle,
  parseTitleFromCompletionBody,
} from "./generate-session-title";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  updateSessionTitle: vi.fn(),
}));

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

describe("applyGeneratedSessionTitle env API keys", () => {
  it("calls the server generate_title endpoint without a client-side api key", async () => {
    const { applyGeneratedSessionTitle } = await import("./generate-session-title");

    vi.mocked(apiPost).mockResolvedValue("Refined title");
    vi.mocked(updateSessionTitle).mockResolvedValue(undefined);

    await applyGeneratedSessionTitle({
      sessionId: "session-1",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      apiKeySource: "env",
      apiKeyEnvVar: "OPENAI_API_KEY",
      model: "gpt-4.1",
      userMessage: "Fix login bug",
    });

    expect(apiPost).toHaveBeenCalledWith("/agent/generate_title", {
      baseUrl: "https://api.example.com/v1",
      apiKey: null,
      apiKeySource: "env",
      apiKeyEnvVar: "OPENAI_API_KEY",
      model: "gpt-4.1",
      userMessage: "Fix login bug",
    });
    expect(updateSessionTitle).toHaveBeenCalledWith("session-1", "Refined title");
  });
});
