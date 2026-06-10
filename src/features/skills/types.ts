export type SystemSkillDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  content: string;
  defaultEnabled: boolean;
  category?: string;
};

export type SkillSource = "system" | "user";

export type ResolvedSkill = {
  id: string;
  slug: string;
  name: string;
  description: string;
  content: string;
  source: SkillSource;
};

export type SkillListItem = {
  slug: string;
  name: string;
  description: string;
  source: SkillSource;
};

export type SkillCardViewModel = ResolvedSkill & {
  enabled: boolean;
  estimatedTokens: number;
};
