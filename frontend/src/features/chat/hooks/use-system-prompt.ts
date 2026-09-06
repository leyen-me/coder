import { useCallback, useEffect, useState } from "react";

import { apiPost } from "@/lib/api/client";

export function useSystemPrompt(
  workspaceDir: string | null | undefined,
  sessionId?: string | null
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
      }
    );
    setSystemPrompt(response.systemPrompt?.trim() || null);
  }, [workspaceDir, sessionId]);

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
        }
      );
      if (active) {
        setSystemPrompt(response.systemPrompt?.trim() || null);
      }
    })();

    return () => {
      active = false;
    };
  }, [workspaceDir, sessionId]);

  return { systemPrompt, refreshSystemPrompt };
}
