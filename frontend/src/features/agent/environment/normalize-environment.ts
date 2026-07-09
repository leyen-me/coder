import type { AgentEnvironment, AgentEnvironmentInput } from "./types";

export function normalizeEnvironment(
  input: AgentEnvironmentInput
): AgentEnvironment {
  return {
    workspaceDir: input.workspaceDir?.trim() || null,
    os: input.os.trim() || "unknown",
    shell: input.shell.trim() || "unknown",
    isGitRepository: input.isGitRepository,
    today: input.today ?? formatToday(new Date()),
    agentsMd: input.agentsMd ?? null,
    systemModules: input.systemModules ?? [],
    skillRoots: input.skillRoots ?? { user: "", workspace: null },
    availableSkills: input.availableSkills ?? [],
    remoteTargets: input.remoteTargets ?? [],
  };
}

function formatToday(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    timeZoneName: "longOffset",
  }).format(date);
}
