import { apiPost } from "@/lib/api/client";
import type { SessionAutonomyMode, SessionKind } from "@/lib/db";
import { resolveAgentSessionPolicy, type AgentSessionPolicy } from "../session-policy";
import type { AgentMode } from "../types";

export type BuildSystemPromptInput = {
  workspaceDir: string | null;
  agentMode?: AgentMode;
  sessionKind?: SessionKind;
  autonomyMode?: SessionAutonomyMode;
  decisionPolicyVersion?: string;
  decisionModel?: string | null;
  extraCommunicationRules?: string[];
};

export async function fetchBuiltSystemPrompt(
  input: BuildSystemPromptInput,
): Promise<string> {
  const result = await apiPost<{ systemPrompt: string }>(
    "/agent/build_system_prompt",
    {
      workspaceDir: input.workspaceDir,
      agentMode: input.agentMode ?? "agent",
      sessionKind: input.sessionKind,
      autonomyMode: input.autonomyMode,
      decisionPolicyVersion: input.decisionPolicyVersion,
      decisionModel: input.decisionModel,
      extraCommunicationRules: input.extraCommunicationRules,
    },
  );

  return result.systemPrompt;
}

export async function resolveSystemPromptForAgent(input: {
  workspaceDir: string | null;
  agentMode?: AgentMode;
  sessionPolicy?: AgentSessionPolicy | null;
  extraCommunicationRules?: string[];
}): Promise<string> {
  const policy = input.sessionPolicy
    ? resolveAgentSessionPolicy(input.sessionPolicy)
    : null;

  return fetchBuiltSystemPrompt({
    workspaceDir: input.workspaceDir,
    agentMode: input.agentMode,
    sessionKind: policy?.sessionKind,
    autonomyMode: policy?.autonomyMode,
    decisionPolicyVersion: policy?.decisionPolicyVersion,
    decisionModel: policy?.decisionModel,
    extraCommunicationRules: input.extraCommunicationRules,
  });
}
