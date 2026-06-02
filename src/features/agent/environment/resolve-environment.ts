import { invoke, isTauri } from "@tauri-apps/api/core";

import { normalizeEnvironment } from "./build-system-prompt";
import type { AgentEnvironment } from "./types";

type RuntimeEnvironmentResponse = {
  os: string;
  shell: string;
  isGitRepository: boolean;
};

export async function resolveAgentEnvironment(
  workspaceDir: string | null
): Promise<AgentEnvironment> {
  if (isTauri()) {
    try {
      const runtime = await invoke<RuntimeEnvironmentResponse>(
        "agent_get_runtime_environment",
        {
          workspaceDir,
        }
      );

      return normalizeEnvironment({
        workspaceDir,
        os: runtime.os,
        shell: runtime.shell,
        isGitRepository: runtime.isGitRepository,
      });
    } catch {
      // Fall through to browser-style defaults when the command is unavailable.
    }
  }

  return normalizeEnvironment({
    workspaceDir,
    os: resolveBrowserOs(),
    shell: resolveBrowserShell(),
    isGitRepository: false,
  });
}

function resolveBrowserOs(): string {
  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const platform = navigator.platform?.trim();
  const userAgent = navigator.userAgent?.trim();

  if (platform && userAgent) {
    return `${platform} (${userAgent})`;
  }

  return platform || userAgent || "unknown";
}

function resolveBrowserShell(): string {
  return "unavailable in browser preview";
}
