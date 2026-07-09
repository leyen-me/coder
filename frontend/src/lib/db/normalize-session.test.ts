import { describe, expect, it } from "vitest";

import { normalizeSessionRecord } from "./normalize-session";

describe("normalizeSessionRecord", () => {
  it("fills session policy defaults for legacy sessions", () => {
    const normalized = normalizeSessionRecord({
      id: "session-1",
      title: "Legacy chat",
      model: "test-model",
      workspaceDir: " /repo ",
      createdAt: 1,
      updatedAt: 2,
    } as never);

    expect(normalized.workspaceDir).toBe("/repo");
    expect(normalized.sessionKind).toBe("standard");
    expect(normalized.autonomyMode).toBe("interactive");
    expect(normalized.decisionPolicyVersion).toBe("mvp-v1");
    expect(normalized.decisionModel).toBeNull();
  });

  it("preserves a valid persisted context usage snapshot", () => {
    const normalized = normalizeSessionRecord({
      id: "session-1",
      title: "Legacy chat",
      model: "test-model",
      createdAt: 1,
      updatedAt: 2,
      contextUsageSnapshot: {
        usedTokens: 100,
        maxTokens: 1_000,
        remainingTokens: 900,
        reservedTokens: 250,
        triggerThreshold: 0.8,
        source: "handoff",
        updatedAt: 123,
      },
    } as never);

    expect(normalized.contextUsageSnapshot).toEqual({
      usedTokens: 100,
      maxTokens: 1_000,
      remainingTokens: 900,
      reservedTokens: 250,
      triggerThreshold: 0.8,
      source: "handoff",
      updatedAt: 123,
    });
  });
});
