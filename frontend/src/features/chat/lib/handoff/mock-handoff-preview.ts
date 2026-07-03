import {
  buildContinuationPrompt,
  buildStoredHandoffArtifact,
} from "@/features/agent/handoff";
import type { SessionHandoffPhase } from "@/features/agent/types";
import type { MessageRecord, SessionRecord } from "@/lib/db";

// =============================================================================
// Handoff UI 预览 Mock —— 改下面 3 个常量就行，看完记得关掉。
//
// MOCK_HANDOFF_PREVIEW_ENABLED
//   true  = 开启 mock（任意聊天页都会显示预览）
//   false = 关闭 mock
//
// MOCK_HANDOFF_PREVIEW_MODE
//   "continuation" = 续跑会话（banner + 结构化首条消息 + 交接文档）
//   "source"       = 来源会话（末尾交接文档卡片）
//   "progress"     = 进行中进度条（输入框上方 1/3 ~ 3/3）
//
// MOCK_HANDOFF_PREVIEW_PROGRESS_STEP（仅 progress 模式有效）
//   1 = 正在生成交接文档
//   2 = 正在创建续跑会话
//   3 = 正在启动自动续跑
// =============================================================================

export const MOCK_HANDOFF_PREVIEW_ENABLED = false;

export type HandoffPreviewMode = "source" | "continuation" | "progress";

export const MOCK_HANDOFF_PREVIEW_MODE: HandoffPreviewMode = "source";

export const MOCK_HANDOFF_PREVIEW_PROGRESS_STEP = 1 as 1 | 2 | 3;

const MOCK_SOURCE_SESSION_ID = "preview-handoff-source";
const MOCK_CONTINUATION_SESSION_ID = "preview-handoff-continuation";

const mockContextUsage = {
  usedTokens: 168_000,
  maxTokens: 200_000,
  remainingTokens: 32_000,
  reservedTokens: 40_000,
  triggerThreshold: 0.8,
};

const mockHandoffBody = [
  "## Original User Intent",
  "优化 handoff 完成后的 UI 展示，让交接文档和续跑会话更容易识别。",
  "",
  "## Current Objective",
  "实现可折叠的交接文档卡片、续跑会话 banner，以及结构化的续跑首条消息。",
  "",
  "## Constraints",
  "- 保持 agent 侧 prompt 不变，只改展示层。",
  "- 兼容没有 messageKind 的旧数据。",
  "",
  "## Completed",
  "- 新增 `HandoffArtifactBlock` 与续跑 banner。",
  "- 为 handoff 消息增加 `messageKind` 标记。",
  "",
  "## In Progress",
  "- 用户正在预览 mock 效果。",
  "",
  "## Pending Next Actions",
  "1. 确认视觉样式是否符合预期。",
  "2. 关闭 mock 开关。",
  "",
  "## Key Decisions",
  "- 交接文档默认折叠，元数据单独展示。",
  "- 续跑会话顶部增加来源会话链接。",
  "",
  "## Rejected Or Superseded Approaches",
  "- 不在 user 气泡里直接渲染完整 Markdown 长文。",
  "",
  "## Artifacts And Evidence",
  "- `src/features/chat/components/handoff-artifact-block.tsx`",
  "- `src/features/chat/components/handoff-continuation-banner.tsx`",
  "",
  "## Background Jobs And Follow-ups",
  "- Unknown",
  "",
  "## Open Questions",
  "- 是否需要在来源会话里高亮「已交接」状态？",
  "",
  "## Resume Instructions",
  "先确认 UI mock，再继续后续调整；关闭 mock 后不应影响真实 handoff 流程。",
].join("\n");

function buildMockHandoffArtifact(input: {
  sourceSessionId: string;
  continuedSessionId: string;
}): string {
  return buildStoredHandoffArtifact({
    sourceSessionId: input.sourceSessionId,
    continuedSessionId: input.continuedSessionId,
    sourceSessionTitle: "Handoff UI 优化",
    generatedAt: new Date().toISOString(),
    model: "preview-model",
    contextUsage: mockContextUsage,
    sessionKind: "long_task",
    autonomyMode: "unattended",
    decisionPolicyVersion: "mvp-v1",
    decisionModel: "default",
    handoffBody: mockHandoffBody,
  });
}

function createMockMessage(
  input: Omit<MessageRecord, "createdAt"> & { createdAt?: number }
): MessageRecord {
  return {
    createdAt: input.createdAt ?? Date.now(),
    ...input,
  };
}

export function getHandoffPreviewMode(): HandoffPreviewMode | null {
  if (!MOCK_HANDOFF_PREVIEW_ENABLED) {
    return null;
  }

  return MOCK_HANDOFF_PREVIEW_MODE;
}

export function buildHandoffPreviewMessages(input: {
  mode: HandoffPreviewMode;
  sessionId: string;
}): MessageRecord[] {
  const artifact = buildMockHandoffArtifact({
    sourceSessionId: MOCK_SOURCE_SESSION_ID,
    continuedSessionId: MOCK_CONTINUATION_SESSION_ID,
  });
  const now = Date.now();

  if (input.mode === "source") {
    return [
      createMockMessage({
        id: "preview-handoff-user",
        sessionId: input.sessionId,
        role: "user",
        content: "请继续优化 handoff 完成后的展示样式。",
        thinking: "",
        processSteps: [],
        toolInvocations: [],
        status: "completed",
        taskId: null,
        error: null,
        createdAt: now - 60_000,
      }),
      createMockMessage({
        id: "preview-handoff-assistant",
        sessionId: input.sessionId,
        role: "assistant",
        content: "我先整理当前进度，并在上下文接近上限时生成交接文档。",
        thinking: "",
        processSteps: [],
        toolInvocations: [],
        status: "completed",
        taskId: "preview-task",
        error: null,
        createdAt: now - 30_000,
      }),
      createMockMessage({
        id: "preview-handoff-artifact",
        sessionId: input.sessionId,
        role: "assistant",
        messageKind: "handoff",
        content: artifact,
        thinking: "",
        processSteps: [],
        toolInvocations: [],
        status: "completed",
        taskId: null,
        error: null,
        createdAt: now,
      }),
    ];
  }

  const continuationPrompt = buildContinuationPrompt({
    handoffArtifact: artifact,
    sourceSessionTitle: "Handoff UI 优化",
    sessionKind: "long_task",
    autonomyMode: "unattended",
    decisionPolicyVersion: "mvp-v1",
  });

  return [
    createMockMessage({
      id: "preview-handoff-continuation",
      sessionId: input.sessionId,
      role: "user",
      messageKind: "handoff_continuation",
      content: continuationPrompt,
      thinking: "",
      processSteps: [],
      toolInvocations: [],
      status: "completed",
      taskId: null,
      error: null,
      createdAt: now - 20_000,
    }),
    createMockMessage({
      id: "preview-handoff-resume-assistant",
      sessionId: input.sessionId,
      role: "assistant",
      content:
        "我已阅读交接文档，接下来会先确认 mock 预览效果，再根据你的反馈微调样式。",
      thinking: "",
      processSteps: [],
      toolInvocations: [],
      status: "completed",
      taskId: "preview-resume-task",
      error: null,
      createdAt: now,
    }),
  ];
}

export function buildHandoffPreviewSessionPatch(input: {
  mode: HandoffPreviewMode;
  session: SessionRecord | null;
}): Partial<SessionRecord> | null {
  if (input.mode === "continuation") {
    return {
      title: "Continue · Handoff UI 优化",
      handoffFromSessionId: MOCK_SOURCE_SESSION_ID,
      handoffMessageId: "preview-handoff-artifact",
      sessionKind: "long_task",
      autonomyMode: "unattended",
    };
  }

  if (input.mode === "source") {
    return {
      title: input.session?.title?.trim() || "Handoff UI 优化",
    };
  }

  return null;
}

export function getHandoffPreviewProgressPhase(): SessionHandoffPhase {
  switch (MOCK_HANDOFF_PREVIEW_PROGRESS_STEP) {
    case 2:
      return "creating_session";
    case 3:
      return "starting_new_session";
    default:
      return "generating_handoff";
  }
}

export function getHandoffPreviewHint(mode: HandoffPreviewMode): string {
  switch (mode) {
    case "source":
      return "来源会话：顶部与交接消息均展示续跑会话链接 + 交接文档";
    case "continuation":
      return "续跑会话：展示 banner + 结构化首条消息";
    case "progress":
      return `进行中：展示输入框上方进度条（第 ${MOCK_HANDOFF_PREVIEW_PROGRESS_STEP}/3 步）`;
  }
}
