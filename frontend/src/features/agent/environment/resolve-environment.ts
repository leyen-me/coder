
import { apiPost } from "@/lib/api/client";
import { getSystemModules } from "@/features/skills/lib/resolve-skills";
import { listRemoteTargets } from "@/lib/db/remote-targets";

import { normalizeEnvironment } from "./normalize-environment";
import type { AgentEnvironment, AgentProjectInstructions } from "./types";

type RuntimeEnvironmentResponse = {
  os: string;
  shell: string;
  isGitRepository: boolean;
  agentsMd?: AgentProjectInstructions;
  skillRoots?: {
    user: string;
    workspace: string | null;
  };
  availableSkills?: Array<{
    slug: string;
    name: string;
    description: string;
    path: string;
    source: "user" | "workspace";
  }>;
};

export async function resolveAgentEnvironment(
  workspaceDir: string | null
): Promise<AgentEnvironment> {
  const systemModules = getSystemModules();
  const modulePayload = systemModules.map((module) => ({
    slug: module.slug,
    name: module.name,
    content: module.content,
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

  try {
    const runtime = await apiPost<RuntimeEnvironmentResponse>(
      "/api/runtime_environment",
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
      systemModules: modulePayload,
      skillRoots: runtime.skillRoots ?? {
        user: "",
        workspace: workspaceDir ? `${workspaceDir}/.coder/skills` : null,
      },
      availableSkills: runtime.availableSkills ?? [],
      remoteTargets,
    });
  } catch {
    // Fall through to browser-style defaults when the command is unavailable.
  }

  return normalizeEnvironment({
    workspaceDir,
    os: resolveBrowserOs(),
    shell: resolveBrowserShell(),
    isGitRepository: false,
    agentsMd: null,
    systemModules: modulePayload,
    skillRoots: { user: "", workspace: workspaceDir ? `${workspaceDir}/.coder/skills` : null },
    availableSkills: [],
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
