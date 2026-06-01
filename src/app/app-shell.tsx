import { useState } from "react";

import { TitleBar } from "@/components/layout/title-bar";
import { AppSidebar } from "@/features/chat/components/app-sidebar";
import { SessionHeader } from "@/features/chat/components/session-header";
import { useSidebarOpen } from "@/features/chat/hooks/use-sidebar-open";
import { NewChatPage } from "@/features/chat/pages/new-chat-page";
import { SettingsPage } from "@/features/settings/pages/settings-page";

import type { AppPage } from "./types";

export function AppShell() {
  const { isOpen: isSidebarOpen, toggle: toggleSidebar, setIsOpen: setSidebarOpen } =
    useSidebarOpen();
  const [page, setPage] = useState<AppPage>("chat");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const handleNewChat = () => {
    setSelectedChatId(null);
  };

  const handleOpenSettings = () => {
    setPage("settings");
    setSidebarOpen(true);
  };

  const handleBackToChat = () => {
    setPage("chat");
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <TitleBar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
        onBack={page === "settings" ? handleBackToChat : undefined}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {page === "chat" ? (
          <>
            <AppSidebar
              open={isSidebarOpen}
              selectedChatId={selectedChatId}
              onSelectChat={setSelectedChatId}
              onNewChat={handleNewChat}
              onOpenSettings={handleOpenSettings}
            />

            <div className="flex min-w-0 flex-1 flex-col">
              <SessionHeader title="新建聊天" />
              <NewChatPage />
            </div>
          </>
        ) : (
          <SettingsPage sidebarOpen={isSidebarOpen} />
        )}
      </div>
    </div>
  );
}
