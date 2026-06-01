import { useState } from "react";

import { AppSidebar } from "@/features/chat/components/app-sidebar";
import { SessionHeader } from "@/features/chat/components/session-header";
import { NewChatPage } from "@/features/chat/pages/new-chat-page";

export function AppShell() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const handleNewChat = () => {
    setSelectedChatId(null);
  };

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <AppSidebar
        selectedChatId={selectedChatId}
        onSelectChat={setSelectedChatId}
        onNewChat={handleNewChat}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <SessionHeader title="新建聊天" />
        <NewChatPage />
      </div>
    </div>
  );
}
