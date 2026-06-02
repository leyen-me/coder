export type AgentEnvironment = {
  workspaceDir: string | null;
  os: string;
  shell: string;
  isGitRepository: boolean;
  today: string;
};

export type AgentEnvironmentInput = {
  workspaceDir: string | null;
  os: string;
  shell: string;
  isGitRepository: boolean;
  today?: string;
};
