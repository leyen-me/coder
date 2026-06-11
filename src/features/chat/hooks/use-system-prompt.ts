import { useCallback, useEffect, useState } from "react";

import {
  buildSystemPrompt,
  resolveAgentEnvironment,
} from "@/features/agent/environment";
import type { AgentMode } from "@/features/agent/types";

export function useSystemPrompt(
  workspaceDir: string | null | undefined,
  agentMode?: AgentMode
) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const refreshSystemPrompt = useCallback(async () => {
    const environment = await resolveAgentEnvironment(
      workspaceDir?.trim() || null
    );
    setSystemPrompt(buildSystemPrompt(environment, agentMode));
  }, [workspaceDir, agentMode]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const environment = await resolveAgentEnvironment(
        workspaceDir?.trim() || null
      );
      if (!active) {
        return;
      }
      setSystemPrompt(buildSystemPrompt(environment, agentMode));
    })();

    return () => {
      active = false;
    };
  }, [workspaceDir, agentMode]);

  return { systemPrompt, refreshSystemPrompt };
}
