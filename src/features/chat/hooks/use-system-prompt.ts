import { useCallback, useEffect, useState } from "react";

import {
  buildSystemPrompt,
  resolveAgentEnvironment,
} from "@/features/agent/environment";
import {
  buildSessionPolicySystemPrompt,
  type AgentSessionPolicy,
} from "@/features/agent/session-policy";
import type { AgentMode } from "@/features/agent/types";

export function useSystemPrompt(
  workspaceDir: string | null | undefined,
  agentMode?: AgentMode,
  sessionPolicy?: AgentSessionPolicy | null
) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const refreshSystemPrompt = useCallback(async () => {
    const environment = await resolveAgentEnvironment(
      workspaceDir?.trim() || null
    );
    const policyPrompt = buildSessionPolicySystemPrompt(sessionPolicy);
    setSystemPrompt(
      [buildSystemPrompt(environment, agentMode), policyPrompt]
        .filter(Boolean)
        .join("\n\n")
    );
  }, [workspaceDir, agentMode, sessionPolicy]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const environment = await resolveAgentEnvironment(
        workspaceDir?.trim() || null
      );
      if (!active) {
        return;
      }
      const policyPrompt = buildSessionPolicySystemPrompt(sessionPolicy);
      setSystemPrompt(
        [buildSystemPrompt(environment, agentMode), policyPrompt]
          .filter(Boolean)
          .join("\n\n")
      );
    })();

    return () => {
      active = false;
    };
  }, [workspaceDir, agentMode, sessionPolicy]);

  return { systemPrompt, refreshSystemPrompt };
}
