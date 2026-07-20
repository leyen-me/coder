import { describe, expect, it } from "vitest";

import type { MessageRecord } from "@/lib/db";

import {
  compactUiFromAgentCompleted,
  compactUiFromApiResponse,
} from "./compact-response";
import {
  resolveCompactBoundaryRender,
  resolveCompactBoundaryRenders,
} from "./resolve-compact-boundary";
import type { SessionCompactUiState } from "./session-compact-ui-store";

function message(
  overrides: Partial<MessageRecord> & Pick<MessageRecord, "id" | "role">,
): MessageRecord {
  return {
    id: overrides.id,
    sessionId: "session-1",
    role: overrides.role,
    messageKind: overrides.messageKind,
    content: overrides.content ?? overrides.id,
    thinking: "",
    toolInvocations: [],
    status: "completed",
    taskId: overrides.taskId ?? null,
    error: null,
    createdAt: overrides.createdAt ?? 1,
  };
}

describe("resolveCompactBoundaryRenders", () => {
  const oldUser = message({ id: "old-1", role: "user", createdAt: 10 });
  const compact1 = message({
    id: "compact-1",
    role: "assistant",
    messageKind: "compact",
    taskId: "kept-1",
    content: "## Context Compaction Summary\n\nfirst",
    createdAt: 15,
  });
  const kept1 = message({ id: "kept-1", role: "user", createdAt: 20 });
  const mid = message({ id: "mid-1", role: "assistant", createdAt: 25 });
  const compact2 = message({
    id: "compact-2",
    role: "assistant",
    messageKind: "compact",
    taskId: "kept-2",
    content: "## Context Compaction Summary\n\nsecond",
    createdAt: 30,
  });
  const kept2 = message({ id: "kept-2", role: "user", createdAt: 35 });
  const messages = [oldUser, compact1, kept1, mid, compact2, kept2];

  it("renders every persisted compact at its real first-kept message", () => {
    const renders = resolveCompactBoundaryRenders(messages, null);
    expect(renders.map((render) => render.beforeMessageId)).toEqual([
      "kept-1",
      "kept-2",
    ]);
  });

  it("keeps history markers while overlaying a temporary loading tip", () => {
    const loading: SessionCompactUiState = {
      phase: "loading",
      boundaryBeforeMessageId: "kept-2",
      i18nKey: "chat.compactInProgress",
    };
    const renders = resolveCompactBoundaryRenders(messages, loading);
    expect(renders).toHaveLength(2);
    expect(renders.find((render) => render.beforeMessageId === "kept-1")?.phase).toBe(
      "success",
    );
    expect(renders.find((render) => render.beforeMessageId === "kept-2")?.phase).toBe(
      "loading",
    );
  });

  it("success ui overlays the matching real event without inventing placement", () => {
    const compactUi: SessionCompactUiState = {
      phase: "success",
      boundaryBeforeMessageId: "kept-2",
      i18nKey: "chat.compactSuccess",
      preview: "second",
    };
    const renders = resolveCompactBoundaryRenders(messages, compactUi);
    expect(renders.map((render) => render.beforeMessageId)).toEqual([
      "kept-1",
      "kept-2",
    ]);
    expect(renders.at(-1)?.preview).toBe("second");
  });

  it("does not invent a historical success placement without a real compact point", () => {
    const compactUi: SessionCompactUiState = {
      phase: "success",
      boundaryBeforeMessageId: "missing",
      i18nKey: "chat.compactSuccess",
    };
    expect(
      resolveCompactBoundaryRenders(
        [
          message({ id: "a", role: "user", createdAt: 1 }),
          message({ id: "b", role: "assistant", createdAt: 2 }),
        ],
        compactUi,
      ),
    ).toEqual([]);
  });

  it("legacy single-render helper returns the latest event", () => {
    expect(resolveCompactBoundaryRender(messages, null)?.beforeMessageId).toBe(
      "kept-2",
    );
  });
});

describe("compactUiFromApiResponse / compactUiFromAgentCompleted", () => {
  const messages = [
    message({ id: "old", role: "user", createdAt: 1 }),
    message({
      id: "compact-1",
      role: "assistant",
      messageKind: "compact",
      taskId: "kept-1",
      createdAt: 10,
    }),
    message({ id: "kept-1", role: "user", createdAt: 20 }),
  ];

  it("success from api uses firstKeptMessageId, never an estimate", () => {
    const state = compactUiFromApiResponse(messages, {
      ok: true,
      compacted: true,
      code: "compacted",
      removedCount: 1,
      remainingCount: 1,
      firstKeptMessageId: "kept-1",
      compactMessageId: "compact-1",
      summaryPreview: "summary",
    });
    expect(state).toMatchObject({
      phase: "success",
      boundaryBeforeMessageId: "kept-1",
    });
  });

  it("success remainingCount counts conversation still in model context", () => {
    const state = compactUiFromAgentCompleted(messages, {
      removedCount: 1,
      summaryPreview: "summary",
      firstKeptMessageId: "kept-1",
      compactMessageId: "compact-1",
    });
    expect(state.boundaryBeforeMessageId).toBe("kept-1");
    expect(state.i18nParams?.remainingCount).toBe(1);
  });

  it("noop remains a temporary tip, not a historical compact event", () => {
    const state = compactUiFromAgentCompleted(
      [
        message({ id: "a", role: "user", createdAt: 1 }),
        message({ id: "b", role: "assistant", createdAt: 2 }),
      ],
      {
        removedCount: 0,
        summaryPreview: "",
      },
    );
    expect(state.phase).toBe("noop");
    expect(state.boundaryBeforeMessageId).toBeTruthy();
  });
});
