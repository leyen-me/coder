export type AgentProjectInstructions = {
  path: string;
  content: string;
  truncated: boolean;
} | null;

export type AgentEnvironment = {
  workspaceDir: string | null;
  os: string;
  shell: string;
  isGitRepository: boolean;
  today: string;
  agentsMd: AgentProjectInstructions;
};

export type AgentEnvironmentInput = {
  workspaceDir: string | null;
  os: string;
  shell: string;
  isGitRepository: boolean;
  today?: string;
  agentsMd?: AgentProjectInstructions;
};
