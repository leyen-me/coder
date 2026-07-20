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
    sessionId: "session-1",
    content: overrides.content ?? overrides.id,
    thinking: "",
    toolInvocations: [],
    status: "completed",
    taskId: null,
    error: null,
    createdAt: 1,
    ...overrides,
  };
}

describe("resolveCompactBoundaryRenders", () => {
  const oldUser = message({ id: "old-1", role: "user", createdAt: 10 });
  const kept1 = message({ id: "kept-1", role: "user", createdAt: 20 });
  const mid = message({ id: "mid-1", role: "assistant", createdAt: 25 });
  const compact1 = message({
    id: "compact-1",
    role: "assistant",
    messageKind: "compact",
    taskId: "kept-1",
    content: "## Context Compaction Summary\n\nfirst",
    createdAt: 26,
  });
  const kept2 = message({ id: "kept-2", role: "user", createdAt: 35 });
  const last = message({ id: "last-1", role: "assistant", createdAt: 40 });
  const compact2 = message({
    id: "compact-2",
    role: "assistant",
    messageKind: "compact",
    taskId: "kept-2",
    content: "## Context Compaction Summary\n\nsecond",
    createdAt: 41,
  });
  const messages = [oldUser, kept1, mid, compact1, kept2, last, compact2];

  it("renders every persisted compact after its real event message", () => {
    const renders = resolveCompactBoundaryRenders(messages, null);
    expect(renders.map((render) => render.afterMessageId)).toEqual([
      "mid-1",
      "last-1",
    ]);
  });

  it("skips session banner when auto-compact already has a process-panel step", () => {
    const midWithStep = message({
      id: "mid-1",
      role: "assistant",
      createdAt: 25,
      processSteps: [
        {
          id: "compact:compact-1",
          kind: "compact",
          state: "completed",
          removedCount: 1,
          compactMessageId: "compact-1",
        },
      ],
    });
    const withInline = [oldUser, kept1, midWithStep, compact1, kept2, last, compact2];
    const renders = resolveCompactBoundaryRenders(withInline, null);
    expect(renders.map((render) => render.afterMessageId)).toEqual(["last-1"]);
  });

  it("repairs legacy mid-inserted markers to the end of that compact era", () => {
    const legacy = [
      message({ id: "a", role: "user", createdAt: 1 }),
      message({ id: "b", role: "user", createdAt: 2, content: "没事" }),
      message({
        id: "compact-legacy",
        role: "assistant",
        messageKind: "compact",
        taskId: "c",
        createdAt: 3,
      }),
      message({ id: "c", role: "assistant", createdAt: 4, content: "好的" }),
    ];
    const renders = resolveCompactBoundaryRenders(legacy, null);
    expect(renders).toHaveLength(1);
    expect(renders[0]?.afterMessageId).toBe("c");
  });

  it("keeps history markers while overlaying a temporary loading tip at the end", () => {
    const loading: SessionCompactUiState = {
      phase: "loading",
      boundaryAfterMessageId: "last-1",
      i18nKey: "chat.compactInProgress",
    };
    const renders = resolveCompactBoundaryRenders(messages, loading);
    expect(renders.find((render) => render.afterMessageId === "mid-1")?.phase).toBe(
      "success",
    );
    expect(renders.find((render) => render.afterMessageId === "last-1")?.phase).toBe(
      "loading",
    );
  });

  it("success ui overlays the matching real event without inventing placement", () => {
    const compactUi: SessionCompactUiState = {
      phase: "success",
      boundaryAfterMessageId: "last-1",
      i18nKey: "chat.compactSuccess",
      preview: "second",
    };
    const renders = resolveCompactBoundaryRenders(messages, compactUi);
    expect(renders.map((render) => render.afterMessageId)).toEqual([
      "mid-1",
      "last-1",
    ]);
    expect(renders.at(-1)?.preview).toBe("second");
  });

  it("legacy single-render helper returns the latest event", () => {
    expect(resolveCompactBoundaryRender(messages, null)?.afterMessageId).toBe(
      "last-1",
    );
  });
});

describe("compactUiFromApiResponse / compactUiFromAgentCompleted", () => {
  const messages = [
    message({ id: "old", role: "user", createdAt: 1 }),
    message({ id: "kept-1", role: "user", createdAt: 20 }),
    message({ id: "last", role: "assistant", createdAt: 30 }),
    message({
      id: "compact-1",
      role: "assistant",
      messageKind: "compact",
      taskId: "kept-1",
      createdAt: 31,
    }),
  ];

  it("success from api uses anchorAfterMessageId for UI placement", () => {
    const state = compactUiFromApiResponse(messages, {
      ok: true,
      compacted: true,
      code: "compacted",
      removedCount: 1,
      remainingCount: 2,
      firstKeptMessageId: "kept-1",
      compactMessageId: "compact-1",
      anchorAfterMessageId: "last",
      summaryPreview: "summary",
    });
    expect(state).toMatchObject({
      phase: "success",
      boundaryAfterMessageId: "last",
    });
  });

  it("success remainingCount counts conversation still in model context", () => {
    const state = compactUiFromAgentCompleted(messages, {
      removedCount: 1,
      summaryPreview: "summary",
      firstKeptMessageId: "kept-1",
      compactMessageId: "compact-1",
      anchorAfterMessageId: "last",
    });
    expect(state.boundaryAfterMessageId).toBe("last");
    expect(state.i18nParams?.remainingCount).toBe(2);
  });

  it("noop remains a temporary tip at the latest message", () => {
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
    expect(state.boundaryAfterMessageId).toBe("b");
  });
});
