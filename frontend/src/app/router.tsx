import { createBrowserRouter, Navigate } from "react-router-dom";

import { ChatPage } from "@/features/chat/pages/chat-page";
import { SkillsPage } from "@/features/skills/pages/skills-page";
import { SettingsPage } from "@/features/settings/pages/settings-page";

import { AppShell } from "./app-shell";
import { MainLayout } from "./main-layout";
import { NotFoundPage } from "./not-found-page";
import { paths } from "./paths";
import { RouteErrorPage } from "./route-error-page";

export const router = createBrowserRouter([
  {
    path: paths.home,
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to={paths.chatNew} replace /> },
      {
        element: <MainLayout />,
        children: [
          { path: "chat/new", element: <ChatPage /> },
          { path: "chat/:chatId", element: <ChatPage /> },
          { path: "skills", element: <SkillsPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      { path: "settings/:category?", element: <SettingsPage /> },
    ],
  },
]);
