export type SystemModuleDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  content: string;
  category?: string;
};

export type SkillSource = "user" | "workspace" | "builtin";

export type AvailableSkill = {
  slug: string;
  name: string;
  description: string;
  path: string;
  directoryPath: string;
  source: SkillSource;
};

export type ResolvedSkill = AvailableSkill & {
  content: string;
};

export type SystemModuleCardViewModel = {
  id: string;
  slug: string;
  name: string;
  description: string;
  content: string;
  estimatedTokens: number;
};

export type UserSkillCardViewModel = ResolvedSkill & {
  estimatedTokens: number;
};

export type SkillRoots = {
  user: string;
  workspace: string | null;
};
