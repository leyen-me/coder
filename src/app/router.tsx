import { createBrowserRouter, Navigate } from "react-router-dom";

import { AutomationsPage } from "@/features/automations/pages/automations-page";
import { ChatSessionPage } from "@/features/chat/pages/chat-session-page";
import { NewChatPage } from "@/features/chat/pages/new-chat-page";
import { HistoryPage } from "@/features/history/pages/history-page";
import { PluginsPage } from "@/features/plugins/pages/plugins-page";
import { SkillsPage } from "@/features/skills/pages/skills-page";
import { SettingsPage } from "@/features/settings/pages/settings-page";

import { AppShell } from "./app-shell";
import { MainLayout } from "./main-layout";
import { paths } from "./paths";

export const router = createBrowserRouter([
  {
    path: paths.home,
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={paths.chatNew} replace /> },
      {
        element: <MainLayout />,
        children: [
          { path: "chat/new", element: <NewChatPage /> },
          { path: "chat/:chatId", element: <ChatSessionPage /> },
          { path: "history", element: <HistoryPage /> },
          { path: "skills", element: <SkillsPage /> },
          { path: "plugins", element: <PluginsPage /> },
          { path: "automations", element: <AutomationsPage /> },
        ],
      },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
