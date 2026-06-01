import type { Messages } from "../message-schema";

export const enMessages = {
  titleBar: {
    ariaLabel: "Title bar",
    windowNav: "Window navigation",
    toggleSidebar: "Toggle sidebar",
    back: "Back",
    forward: "Forward",
  },
  windowControls: {
    minimize: "Minimize",
    maximize: "Maximize",
    restore: "Restore",
    close: "Close",
  },
  sidebar: {
    newChat: "New chat",
    search: "Search",
    skills: "Skills",
    components: "Components",
    automations: "Automations",
    settings: "Settings",
    allChats: "All chats",
    filterChats: "Filter chats",
    showMore: "Show more",
  },
  session: {
    newChat: "New chat",
    fastMode: "Fast mode",
    commit: "Commit",
    exportSession: "Export session",
    shareLink: "Share link",
    splitLayout: "Split layout",
    rightPanel: "Right panel",
    workbench: "Workbench",
  },
  chat: {
    headline: "What do you want to build in {project}?",
    composerPlaceholder:
      "Describe a task, @ mention files, / run commands, ? browse skills",
    addAttachment: "Add attachment",
    defaultPermission: "Default permission",
    readOnly: "Read only",
    confirmBeforeRun: "Confirm before running",
    send: "Send",
    localWork: "Local workspace",
  },
  settings: {
    title: "Settings",
    categories: {
      general: "General",
      appearance: "Appearance",
    },
    general: {
      languageLabel: "Language",
      languageDescription: "Choose the interface language",
      languageAriaLabel: "Language",
    },
    appearance: {
      themeLabel: "Theme",
      themeDescription: "Choose the application color theme",
      themeAriaLabel: "Theme",
    },
  },
  theme: {
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  locale: {
    zh: "中文",
    en: "English",
  },
  starterPrompts: [
    {
      id: "starter-1",
      label: "Help me think of a suitable entry-level task",
      prompt: "Help me think of a suitable entry-level task",
    },
    {
      id: "starter-2",
      label: "Explain this project to me",
      prompt: "Explain this project to me",
    },
    {
      id: "starter-3",
      label: "Link your commonly used apps to the Agent",
      prompt: "Link your commonly used apps to the Agent",
    },
  ],
  mockChats: [
    {
      id: "1",
      title: "Help me think of a suitable entry-level task",
      relativeTime: "2 weeks ago",
    },
    {
      id: "2",
      title: "Explain this project to me",
      relativeTime: "2 weeks ago",
    },
    {
      id: "3",
      title: "Link your commonly used apps to the Agent",
      relativeTime: "1 month ago",
    },
    {
      id: "4",
      title: "Refactor auth module and add tests",
      relativeTime: "1 month ago",
    },
    {
      id: "5",
      title: "Summarize meeting notes from last Friday",
      relativeTime: "2 months ago",
    },
    {
      id: "6",
      title: "Draft onboarding doc for new teammates",
      relativeTime: "2 months ago",
    },
  ],
} satisfies Messages;
