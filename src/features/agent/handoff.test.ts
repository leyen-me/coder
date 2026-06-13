import { describe, expect, it } from "vitest";

import {
  AGENT_HANDOFF_SYSTEM_PROMPT,
  buildAgentHandoffUserPrompt,
  buildContinuationPrompt,
  buildFallbackHandoffBody,
  buildStoredHandoffArtifact,
  deriveContinuationSessionTitle,
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
    });

    expect(prompt).toContain("authoritative working state");
    expect(prompt).toContain("Continue autonomously without waiting for user input");
    expect(prompt).toContain("choose the best reasonable default");
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
});
