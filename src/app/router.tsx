import { createBrowserRouter, Navigate } from "react-router-dom";

import { AutomationsPage } from "@/features/automations/pages/automations-page";
import { ChatPage } from "@/features/chat/pages/chat-page";
import { HistoryPage } from "@/features/history/pages/history-page";
import { SkillsPage } from "@/features/skills/pages/skills-page";
import { StatisticsPage } from "@/features/statistics/pages/statistics-page";
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
          { path: "chat/new", element: <ChatPage /> },
          { path: "chat/:chatId", element: <ChatPage /> },
          { path: "history", element: <HistoryPage /> },
          { path: "skills", element: <SkillsPage /> },
          { path: "automations", element: <AutomationsPage /> },
          { path: "statistics", element: <StatisticsPage /> },
        ],
      },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
