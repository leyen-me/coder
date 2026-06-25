import { invoke, isTauri } from "@tauri-apps/api/core";

import { getEnabledSystemSkills } from "@/features/skills/lib/resolve-skills";
import { listRemoteTargets } from "@/lib/db/remote-targets";

import { normalizeEnvironment } from "./build-system-prompt";
import type { AgentEnvironment, AgentProjectInstructions } from "./types";

type RuntimeEnvironmentResponse = {
  os: string;
  shell: string;
  isGitRepository: boolean;
  agentsMd?: AgentProjectInstructions;
};

export async function resolveAgentEnvironment(
  workspaceDir: string | null
): Promise<AgentEnvironment> {
  const enabledSystemSkills = await getEnabledSystemSkills();
  const skillPayload = enabledSystemSkills.map((skill) => ({
    slug: skill.slug,
    name: skill.name,
    content: skill.content,
  }));

  // Load remote targets — only expose enabled ones to the agent
  const remoteTargets = (await listRemoteTargets())
    .filter((t) => t.enabled)
    .map((t) => ({
      alias: t.alias,
      host: t.host,
      port: t.port,
      user: t.user,
    }));

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
        agentsMd: runtime.agentsMd ?? null,
        enabledSystemSkills: skillPayload,
        remoteTargets,
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
    agentsMd: null,
    enabledSystemSkills: skillPayload,
    remoteTargets,
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
