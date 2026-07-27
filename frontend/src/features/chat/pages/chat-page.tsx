import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";

import { paths } from "@/app/paths";

import { ChatSessionView } from "../views/chat-session-view";
import { NewChatView } from "../views/new-chat-view";
import { SubAgentPanel } from "../components/sub-agent-panel";
import {
  SubAgentPanelProvider,
  useSubAgentPanel,
} from "../store/sub-agent-panel-store";

function ChatPageContent() {
  const { pathname } = useLocation();
  const { chatId } = useParams<{ chatId: string }>();
  const { reset } = useSubAgentPanel();

  // Switching the parent session clears any open SubAgent panels, since they
  // belong to the previously viewed session.
  useEffect(() => {
    reset();
  }, [chatId, reset]);

  if (pathname === paths.chatNew) {
    return <NewChatView />;
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1">
        <ChatSessionView key={chatId} chatId={chatId ?? ""} />
      </div>
      <SubAgentPanel />
    </div>
  );
}

export function ChatPage() {
  return (
    <SubAgentPanelProvider>
      <ChatPageContent />
    </SubAgentPanelProvider>
  );
}
