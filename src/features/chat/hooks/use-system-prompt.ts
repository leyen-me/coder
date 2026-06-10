import { useCallback, useEffect, useState } from "react";

import {
  buildSystemPrompt,
  resolveAgentEnvironment,
} from "@/features/agent/environment";

export function useSystemPrompt(workspaceDir: string | null | undefined) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const refreshSystemPrompt = useCallback(async () => {
    const environment = await resolveAgentEnvironment(
      workspaceDir?.trim() || null
    );
    setSystemPrompt(buildSystemPrompt(environment));
  }, [workspaceDir]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const environment = await resolveAgentEnvironment(
        workspaceDir?.trim() || null
      );
      if (!active) {
        return;
      }
      setSystemPrompt(buildSystemPrompt(environment));
    })();

    return () => {
      active = false;
    };
  }, [workspaceDir]);

  return { systemPrompt, refreshSystemPrompt };
}
