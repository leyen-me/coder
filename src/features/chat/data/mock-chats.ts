export type ChatHistoryItem = {
  id: string;
  title: string;
  relativeTime: string;
};

export const MOCK_CHAT_HISTORY: ChatHistoryItem[] = [
  { id: "1", title: "Help me think of a suitable entry-level task", relativeTime: "2 weeks" },
  { id: "2", title: "Explain this project to me", relativeTime: "2 weeks" },
  { id: "3", title: "Link your commonly used apps to Codex", relativeTime: "1 month" },
  { id: "4", title: "Refactor auth module and add tests", relativeTime: "1 month" },
  { id: "5", title: "Summarize meeting notes from last Friday", relativeTime: "2 months" },
  { id: "6", title: "Draft onboarding doc for new teammates", relativeTime: "2 months" },
];

export const STARTER_PROMPTS = [
  {
    id: "starter-1",
    label: "帮我构思一个合适的入门任务",
    prompt: "帮我构思一个合适的入门任务",
  },
  {
    id: "starter-2",
    label: "向我介绍这个项目",
    prompt: "向我介绍这个项目",
  },
  {
    id: "starter-3",
    label: "把常用应用连接到 Agent",
    prompt: "把常用应用连接到 Agent",
  },
] as const;

export const DEFAULT_PROJECT_NAME = "coder";
