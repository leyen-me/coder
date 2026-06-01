import type { Messages } from "../message-schema";

export const zhMessages = {
  titleBar: {
    ariaLabel: "标题栏",
    windowNav: "窗口导航",
    toggleSidebar: "切换侧栏",
    back: "后退",
    forward: "前进",
  },
  windowControls: {
    minimize: "最小化",
    maximize: "最大化",
    restore: "还原",
    close: "关闭",
  },
  sidebar: {
    newChat: "新建聊天",
    search: "搜索",
    skills: "技能",
    components: "组件",
    automations: "自动化",
    settings: "设置",
    allChats: "所有聊天",
    filterChats: "筛选聊天",
    showMore: "展开更多",
  },
  session: {
    newChat: "新建聊天",
    fastMode: "快速模式",
    commit: "提交",
    exportSession: "导出会话",
    shareLink: "分享链接",
    splitLayout: "分屏布局",
    rightPanel: "右侧面板",
    workbench: "工作台",
  },
  chat: {
    headline: "想在 {project} 里构建什么？",
    composerPlaceholder: "输入任务，@ 引用文件，/ 使用命令，? 查看技能",
    addAttachment: "添加附件",
    defaultPermission: "默认权限",
    readOnly: "只读",
    confirmBeforeRun: "需确认后执行",
    send: "发送",
    localWork: "本地工作",
  },
  settings: {
    title: "设置",
    categories: {
      general: "常规",
      appearance: "外观",
    },
    general: {
      languageLabel: "语言",
      languageDescription: "选择界面显示语言",
      languageAriaLabel: "语言",
    },
    appearance: {
      themeLabel: "主题",
      themeDescription: "选择应用的颜色主题",
      themeAriaLabel: "主题",
    },
  },
  theme: {
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
  },
  locale: {
    zh: "中文",
    en: "English",
  },
  starterPrompts: [
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
  ],
  mockChats: [
    { id: "1", title: "帮我构思一个合适的入门任务", relativeTime: "2 周前" },
    { id: "2", title: "向我介绍这个项目", relativeTime: "2 周前" },
    { id: "3", title: "把常用应用连接到 Agent", relativeTime: "1 个月前" },
    { id: "4", title: "重构 auth 模块并补充测试", relativeTime: "1 个月前" },
    { id: "5", title: "总结上周五的会议纪要", relativeTime: "2 个月前" },
    { id: "6", title: "为新成员起草 onboarding 文档", relativeTime: "2 个月前" },
  ],
} satisfies Messages;
