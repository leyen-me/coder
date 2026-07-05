import { useCallback, useEffect, useState } from "react";

import { fetchBuiltSystemPrompt } from "@/features/agent/api/build-system-prompt";
import type { AgentSessionPolicy } from "@/features/agent/session-policy";
import type { AgentMode } from "@/features/agent/types";

export function useSystemPrompt(
  workspaceDir: string | null | undefined,
  agentMode?: AgentMode,
  sessionPolicy?: AgentSessionPolicy | null
) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const refreshSystemPrompt = useCallback(async () => {
    const policy = sessionPolicy ?? null;
    const prompt = await fetchBuiltSystemPrompt({
      workspaceDir: workspaceDir?.trim() || null,
      agentMode,
      sessionKind: policy?.sessionKind,
      autonomyMode: policy?.autonomyMode,
      decisionPolicyVersion: policy?.decisionPolicyVersion,
      decisionModel: policy?.decisionModel,
    });
    setSystemPrompt(prompt);
  }, [workspaceDir, agentMode, sessionPolicy]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const policy = sessionPolicy ?? null;
      const prompt = await fetchBuiltSystemPrompt({
        workspaceDir: workspaceDir?.trim() || null,
        agentMode,
        sessionKind: policy?.sessionKind,
        autonomyMode: policy?.autonomyMode,
        decisionPolicyVersion: policy?.decisionPolicyVersion,
        decisionModel: policy?.decisionModel,
      });
      if (!active) {
        return;
      }
      setSystemPrompt(prompt);
    })();

    return () => {
      active = false;
    };
  }, [workspaceDir, agentMode, sessionPolicy]);

  return { systemPrompt, refreshSystemPrompt };
}
