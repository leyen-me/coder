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
  systemModules: Array<{
    slug: string;
    name: string;
    content: string;
  }>;
  skillRoots: {
    user: string;
    workspace: string | null;
  };
  availableSkills: Array<{
    slug: string;
    name: string;
    description: string;
    path: string;
    source: "user" | "workspace";
  }>;
  remoteTargets: Array<{
    alias: string;
    host: string;
    port: number;
    user: string;
  }>;
};

export type AgentEnvironmentInput = {
  workspaceDir: string | null;
  os: string;
  shell: string;
  isGitRepository: boolean;
  today?: string;
  agentsMd?: AgentProjectInstructions;
  systemModules?: AgentEnvironment["systemModules"];
  skillRoots?: AgentEnvironment["skillRoots"];
  availableSkills?: AgentEnvironment["availableSkills"];
  remoteTargets?: AgentEnvironment["remoteTargets"];
};
