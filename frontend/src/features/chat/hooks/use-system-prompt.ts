import { useCallback, useEffect, useState } from "react";

import { apiPost } from "@/lib/api/client";
import type { AgentMode } from "@/features/agent/types";

export function useSystemPrompt(
  workspaceDir: string | null | undefined,
  sessionId?: string | null,
  agentMode?: AgentMode
) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const loadSystemPrompt = useCallback(async () => {
    const normalizedSessionId = sessionId?.trim();
    if (!normalizedSessionId) {
      setSystemPrompt(null);
      return;
    }
    const response = await apiPost<{ systemPrompt?: string | null }>(
      "/api/agent/system_prompt",
      {
        sessionId: normalizedSessionId,
        workspaceDir: workspaceDir?.trim() || null,
        agentMode: agentMode ?? null,
      }
    );
    setSystemPrompt(response.systemPrompt?.trim() || null);
  }, [workspaceDir, sessionId, agentMode]);

  const refreshSystemPrompt = useCallback(async () => {
    await loadSystemPrompt();
  }, [loadSystemPrompt]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const normalizedSessionId = sessionId?.trim();
      if (!normalizedSessionId) {
        if (active) {
          setSystemPrompt(null);
        }
        return;
      }
      const response = await apiPost<{ systemPrompt?: string | null }>(
        "/api/agent/system_prompt",
        {
          sessionId: normalizedSessionId,
          workspaceDir: workspaceDir?.trim() || null,
          agentMode: agentMode ?? null,
        }
      );
      if (active) {
        setSystemPrompt(response.systemPrompt?.trim() || null);
      }
    })();

    return () => {
      active = false;
    };
  }, [workspaceDir, sessionId, agentMode]);

  return { systemPrompt, refreshSystemPrompt };
}
