import { useState } from "react";

import { TitleBar } from "@/components/layout/title-bar";
import { AppSidebar } from "@/features/chat/components/app-sidebar";
import { SessionHeader } from "@/features/chat/components/session-header";
import { useSidebarOpen } from "@/features/chat/hooks/use-sidebar-open";
import { NewChatPage } from "@/features/chat/pages/new-chat-page";

export function AppShell() {
  const { isOpen: isSidebarOpen, toggle: toggleSidebar } = useSidebarOpen();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const handleNewChat = () => {
    setSelectedChatId(null);
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <TitleBar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar
          open={isSidebarOpen}
          selectedChatId={selectedChatId}
          onSelectChat={setSelectedChatId}
          onNewChat={handleNewChat}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <SessionHeader title="新建聊天" />
          <NewChatPage />
        </div>
      </div>
    </div>
  );
}
