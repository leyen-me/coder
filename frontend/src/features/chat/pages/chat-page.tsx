import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { paths } from "@/app/paths";

import { ChatSessionView } from "../views/chat-session-view";
import { NewChatView } from "../views/new-chat-view";
import { SubAgentPanel } from "../components/sub-agent-panel";
import {
  SubAgentPanelProvider,
  useSubAgentPanel,
} from "../store/sub-agent-panel-store";

const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 760;
const PANEL_DEFAULT_WIDTH = 440;

function ChatPageContent() {
  const { pathname } = useLocation();
  const { chatId } = useParams<{ chatId: string }>();
  const { reset, childSessionId } = useSubAgentPanel();
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Switching the parent session clears any open SubAgent panel, since it
  // belongs to the previously viewed session.
  useEffect(() => {
    reset();
  }, [chatId, reset]);

  // Drag-to-resize: the separator between the main view and the right panel.
  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const next = rect.right - event.clientX;
      setPanelWidth(
        Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, next)),
      );
    }
    function onUp() {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startResize = () => {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  if (pathname === paths.chatNew) {
    return <NewChatView />;
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1">
        <ChatSessionView key={chatId} chatId={chatId ?? ""} />
      </div>
      {childSessionId && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="拖动调整子 agent 面板宽度"
            onPointerDown={startResize}
            className="group relative w-1 shrink-0 cursor-col-resize"
          >
            {/* Thin 1px line by default, centered on the divider; thickens and
                recolors on hover without shifting layout (the 4px container is
                the invisible hit area, mirroring VS Code's sash behavior). */}
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-all group-hover:w-1 group-hover:bg-primary/50" />
          </div>
          <SubAgentPanel style={{ width: panelWidth }} />
        </>
      )}
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
