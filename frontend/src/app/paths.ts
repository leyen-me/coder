/** Application route paths — single source of truth for navigation and router config. */
export const paths = {
  home: "/",
  chatNew: "/chat/new",
  chat: (chatId: string) => `/chat/${chatId}` as const,
  skills: "/skills",
  automations: "/automations",
  settings: "/settings",
  settingsCategory: (category: string) => `/settings/${category}` as const,
} as const;

export function isChatRoute(pathname: string): boolean {
  return pathname === paths.chatNew || /^\/chat\/[^/]+$/.test(pathname);
}
