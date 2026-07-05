import { useCallback, useEffect, useState } from "react";

import { resolveAgentEnvironment } from "@/features/agent/environment";
import {
  assembleSystemMessages,
  serializeSystemMessages,
} from "@/features/agent/system-messages";
import type { AgentSessionPolicy } from "@/features/agent/session-policy";
import type { AgentMode } from "@/features/agent/types";

export function useSystemPrompt(
  workspaceDir: string | null | undefined,
  sessionId?: string | null,
  agentMode?: AgentMode,
  sessionPolicy?: AgentSessionPolicy | null
) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const loadSystemPrompt = useCallback(async () => {
    const environment = await resolveAgentEnvironment(
      workspaceDir?.trim() || null
    );
    const systemMessages = await assembleSystemMessages({
      environment,
      agentMode,
      sessionId: sessionId?.trim() || undefined,
      sessionPolicy,
    });
    setSystemPrompt(serializeSystemMessages(systemMessages));
  }, [workspaceDir, sessionId, agentMode, sessionPolicy]);

  const refreshSystemPrompt = useCallback(async () => {
    await loadSystemPrompt();
  }, [loadSystemPrompt]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const environment = await resolveAgentEnvironment(workspaceDir?.trim() || null);
      if (!active) {
        return;
      }
      const systemMessages = await assembleSystemMessages({
        environment,
        agentMode,
        sessionId: sessionId?.trim() || undefined,
        sessionPolicy,
      });
      if (!active) {
        return;
      }
      setSystemPrompt(serializeSystemMessages(systemMessages));
    })();

    return () => {
      active = false;
    };
  }, [workspaceDir, sessionId, agentMode, sessionPolicy]);

  return { systemPrompt, refreshSystemPrompt };
}
