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
  enabledSystemSkills: Array<{
    slug: string;
    name: string;
    content: string;
  }>;
};

export type AgentEnvironmentInput = {
  workspaceDir: string | null;
  os: string;
  shell: string;
  isGitRepository: boolean;
  today?: string;
  agentsMd?: AgentProjectInstructions;
  enabledSystemSkills?: AgentEnvironment["enabledSystemSkills"];
};
