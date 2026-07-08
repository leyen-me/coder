import { describe, expect, it } from "vitest";

import {
  AGENT_HANDOFF_SYSTEM_PROMPT,
  buildAgentHandoffUserPrompt,
  buildContinuationPrompt,
  buildVerificationChecklist,
  buildFallbackHandoffBody,
  buildStoredHandoffArtifact,
  deriveContinuationSessionTitle,
  evaluateHandoffQuality,
  extractKnownErrorFingerprints,
  extractReferencedSkillSlugs,
  extractWorkingSet,
  findLatestHandoffArtifactMessage,
  extractHandoffArtifactFromContinuationPrompt,
  isHandoffArtifactContent,
  isHandoffContinuationPrompt,
  parseStoredHandoffArtifact,
  resolveContinuedSessionIdFromMessages,
  resolveHandoffMessageKind,
} from "./handoff";

const contextUsage = {
  usedTokens: 150_000,
  maxTokens: 200_000,
  remainingTokens: 50_000,
  reservedTokens: 40_000,
  triggerThreshold: 0.75,
};

describe("handoff helpers", () => {
  it("provides a structured handoff system prompt", () => {
    expect(AGENT_HANDOFF_SYSTEM_PROMPT).toContain("## Communication Rules");
    expect(AGENT_HANDOFF_SYSTEM_PROMPT).toContain("## Handoff Constraints");
    expect(AGENT_HANDOFF_SYSTEM_PROMPT).toContain("## Original User Intent");
    expect(AGENT_HANDOFF_SYSTEM_PROMPT).toContain("## Resume Instructions");
  });

  it("builds a user prompt with context budget metadata", () => {
    const prompt = buildAgentHandoffUserPrompt({
      sessionTitle: "长任务排查",
      contextUsage,
      sessionKind: "long_task",
      autonomyMode: "unattended",
      decisionPolicyVersion: "mvp-v1",
      decisionModel: "decision-model",
    });

    expect(prompt).toContain("sourceSessionTitle: 长任务排查");
    expect(prompt).toContain("sessionKind: long_task");
    expect(prompt).toContain("autonomyMode: unattended");
    expect(prompt).toContain("usedTokens: 150000");
    expect(prompt).toContain("triggerThreshold: 0.75");
    expect(prompt).toContain("Prefer autonomous continuation");
  });

  it("wraps the generated handoff body with durable metadata", () => {
    const artifact = buildStoredHandoffArtifact({
      sourceSessionId: "session-old",
      continuedSessionId: "session-new",
      sourceSessionTitle: "长任务排查",
      generatedAt: "2026-06-10T20:00:00.000Z",
      model: "test-model",
      contextUsage,
      sessionKind: "long_task",
      autonomyMode: "unattended",
      decisionPolicyVersion: "mvp-v1",
      decisionModel: "decision-model",
      handoffBody: "## Original User Intent\n继续任务",
    });

    expect(artifact).toContain("# Automatic Session Handoff");
    expect(artifact).toContain("- sourceSessionId: session-old");
    expect(artifact).toContain("- continuedSessionId: session-new");
    expect(artifact).toContain("- sessionKind: long_task");
    expect(artifact).toContain("## Original User Intent");
  });

  it("builds a continuation prompt that tells the next session to continue safely", () => {
    const prompt = buildContinuationPrompt({
      sourceSessionTitle: "长任务排查",
      handoffArtifact: "# Automatic Session Handoff\n\n## Resume Instructions\n继续",
      sessionKind: "long_task",
      autonomyMode: "unattended",
      decisionPolicyVersion: "mvp-v1",
      workingSet: [
        {
          path: "frontend/src/features/agent/handoff.ts",
          operationType: "edit",
          lastOperation: "2026-07-08T10:00:00.000Z",
          createdAt: 1,
        },
      ],
      verificationChecklist: ["Re-run `pnpm test handoff`."],
      toolArchiveIndexPath: ".agent/sessions/source/tool-archive/index.json",
    });

    expect(prompt).toContain("authoritative working state");
    expect(prompt).toContain("Continue autonomously without waiting for user input");
    expect(prompt).toContain("Do NOT glob or broadly explore the codebase");
    expect(prompt).toContain("Tool archive index");
    expect(prompt).toContain("Continuation Verification Checklist");
    expect(prompt).toContain("Previous session: 长任务排查");
    expect(prompt).toContain("Session policy: long_task / unattended / mvp-v1");
  });

  it("creates a deterministic fallback handoff when generation fails", () => {
    const fallback = buildFallbackHandoffBody({
      userContent: "继续修复跨 session 续跑",
      sourceSessionTitle: "跨 session",
    });

    expect(fallback).toContain("## Original User Intent");
    expect(fallback).toContain("继续修复跨 session 续跑");
    expect(fallback).toContain("Automatic handoff generation failed");
    expect(fallback).toContain("proceed with conservative assumptions");
  });

  it("derives a continuation session title", () => {
    expect(deriveContinuationSessionTitle("现有任务")).toBe("Continue · 现有任务");
    expect(deriveContinuationSessionTitle("   ")).toBe("Continue · Session");
  });

  it("parses stored handoff artifacts into metadata and body", () => {
    const artifact = buildStoredHandoffArtifact({
      sourceSessionId: "session-old",
      continuedSessionId: "session-new",
      sourceSessionTitle: "长任务排查",
      generatedAt: "2026-06-10T20:00:00.000Z",
      model: "test-model",
      contextUsage,
      sessionKind: "long_task",
      autonomyMode: "unattended",
      decisionPolicyVersion: "mvp-v1",
      decisionModel: "decision-model",
      handoffBody: "## Original User Intent\n继续任务",
    });

    const parsed = parseStoredHandoffArtifact(artifact);
    expect(parsed).not.toBeNull();
    expect(parsed?.sourceSessionId).toBe("session-old");
    expect(parsed?.continuedSessionId).toBe("session-new");
    expect(parsed?.sourceSessionTitle).toBe("长任务排查");
    expect(parsed?.body).toContain("## Original User Intent");
    expect(isHandoffArtifactContent(artifact)).toBe(true);
  });

  it("extracts handoff artifacts from continuation prompts", () => {
    const prompt = buildContinuationPrompt({
      sourceSessionTitle: "长任务排查",
      handoffArtifact: "# Automatic Session Handoff\n\n## Resume Instructions\n继续",
      sessionKind: "long_task",
      autonomyMode: "unattended",
      decisionPolicyVersion: "mvp-v1",
    });

    expect(isHandoffContinuationPrompt(prompt)).toBe(true);
    expect(extractHandoffArtifactFromContinuationPrompt(prompt)).toContain(
      "# Automatic Session Handoff"
    );
    expect(
      resolveHandoffMessageKind({
        role: "user",
        messageKind: undefined,
        content: prompt,
      })
    ).toBe("handoff_continuation");
    expect(
      resolveHandoffMessageKind({
        role: "assistant",
        messageKind: "handoff",
        content: "ignored",
      })
    ).toBe("handoff");
  });

  it("resolves the continued session id from the latest handoff artifact message", () => {
    const artifact = buildStoredHandoffArtifact({
      sourceSessionId: "session-old",
      continuedSessionId: "session-new",
      sourceSessionTitle: "长任务排查",
      generatedAt: "2026-06-10T20:00:00.000Z",
      model: "test-model",
      contextUsage,
      sessionKind: "long_task",
      autonomyMode: "unattended",
      decisionPolicyVersion: "mvp-v1",
      decisionModel: "decision-model",
      handoffBody: "## Resume Instructions\n继续",
    });

    const messages = [
      {
        role: "assistant" as const,
        messageKind: "handoff" as const,
        content: artifact,
      },
      {
        role: "user" as const,
        messageKind: undefined,
        content: "later message",
      },
    ];

    expect(findLatestHandoffArtifactMessage(messages)?.content).toBe(artifact);
    expect(resolveContinuedSessionIdFromMessages(messages)).toBe("session-new");
  });

  it("extracts a deduplicated working set from tool invocations", () => {
    const workingSet = extractWorkingSet([
      {
        id: "msg-1",
        sessionId: "session",
        role: "assistant",
        content: "done",
        thinking: "",
        processSteps: [],
        toolInvocations: [
          {
            id: "call-1",
            name: "read_file",
            input: { path: "src/a.ts" },
            output: { ok: true, tool: "read_file", data: { sha256: "abc" } },
            state: "output-available",
          },
          {
            id: "call-2",
            name: "edit_file",
            input: { path: "src/a.ts" },
            state: "input-available",
          },
          {
            id: "call-3",
            name: "glob",
            input: { glob_pattern: "**/*.ts" },
            state: "input-available",
          },
        ],
        status: "completed",
        taskId: null,
        error: null,
        createdAt: 2,
      },
    ]);

    expect(workingSet).toHaveLength(2);
    expect(workingSet[0]?.path).toBe("src/a.ts");
    expect(workingSet[0]?.operationType).toBe("edit");
    expect(workingSet[0]?.lastKnownHash).toBeNull();
    expect(workingSet[1]?.path).toBe("[glob]");
  });

  it("extracts referenced skills and known errors from session messages", () => {
    expect(
      extractReferencedSkillSlugs([
        {
          id: "user-1",
          sessionId: "session",
          role: "user",
          content: "/review please",
          referencedSkills: ["review", "debug"],
          thinking: "",
          processSteps: [],
          toolInvocations: [],
          status: "completed",
          taskId: null,
          error: null,
          createdAt: 1,
        },
      ])
    ).toEqual(["review", "debug"]);

    expect(
      extractKnownErrorFingerprints([
        {
          id: "assistant-1",
          sessionId: "session",
          role: "assistant",
          content: "",
          thinking: "",
          processSteps: [],
          toolInvocations: [
            {
              id: "call-1",
              name: "shell",
              input: {},
              state: "output-error",
              errorText: "TS2345 at handoff.ts:42",
            },
          ],
          status: "failed",
          taskId: null,
          error: "TS2345",
          createdAt: 1,
        },
      ])
    ).toEqual(["shell: TS2345 at handoff.ts:42"]);
  });

  it("builds a continuation verification checklist and quality gate", () => {
    const checklist = buildVerificationChecklist({
      verification: {
        lastTestCommand: "pnpm test handoff",
        lastTestExitCode: 0,
        lastBuildCommand: null,
        lastBuildExitCode: null,
        failingCommandSnippet: null,
      },
      workingSet: [
        {
          path: "frontend/src/features/agent/handoff.ts",
          operationType: "edit",
          lastOperation: "2026-07-08T10:00:00.000Z",
          createdAt: 1,
        },
      ],
      backgroundJobs: [
        {
          shellId: "shell-1",
          command: "pnpm dev",
          workingDirectory: "/workspace",
          status: "running",
          lastOutput: "ready",
        },
      ],
    });

    expect(checklist[0]).toContain("pnpm test handoff");
    expect(checklist[1]).toContain("handoff.ts");
    expect(checklist[2]).toContain("shell-1");

    const report = evaluateHandoffQuality({
      handoffBody: [
        "## Pending Next Actions",
        "1. Update frontend/src/features/agent/handoff.ts",
        "",
        "## Key Decisions",
        "- Keep working set limited.",
        "",
        "## Artifacts And Evidence",
        "- Unknown",
        "",
        "Files: frontend/src/features/agent/handoff.ts frontend/src/features/agent/store/agent-store.tsx frontend/src/features/agent/context-monitor.ts",
      ].join("\n"),
      workingSet: [
        {
          path: "frontend/src/features/agent/handoff.ts",
          operationType: "edit",
          lastOperation: "2026-07-08T10:00:00.000Z",
          createdAt: 1,
        },
      ],
      verification: {
        lastTestCommand: "pnpm test handoff",
        lastTestExitCode: 0,
        lastBuildCommand: null,
        lastBuildExitCode: null,
        failingCommandSnippet: null,
      },
    });

    expect(report.ok).toBe(true);
    expect(report.failures).toHaveLength(0);
  });
});
