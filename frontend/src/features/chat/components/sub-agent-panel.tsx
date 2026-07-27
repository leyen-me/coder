import { useEffect, useState, type CSSProperties } from "react";
import { X } from "lucide-react";

import { ChatSessionView } from "../views/chat-session-view";
import { useSubAgentPanel } from "../store/sub-agent-panel-store";
import { getSession } from "@/lib/db/sessions";

/**
 * Right-hand panel that shows a single SubAgent (child) session alongside the
 * parent. Clicking a SubAgent Label opens the child here (replacing any
 * previously open child) instead of navigating away, so the parent
 * conversation stays visible.
 *
 * The panel is read-only: the child is rendered with `ChatSessionView
 * readOnly`, so there is no composer and the user cannot send a new prompt —
 * they can only watch it run (and pause it via the info bar). Only one child
 * is shown at a time; clicking a different Label unmounts the current child
 * and mounts the new one.
 */
export function SubAgentPanel({ style }: { style?: CSSProperties }) {
  const { childSessionId, closeChild } = useSubAgentPanel();

  if (!childSessionId) {
    return null;
  }

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-l border-border bg-background"
      style={style}
    >
      <SubAgentPanelHeader sessionId={childSessionId} onClose={closeChild} />
      <div className="min-h-0 flex-1">
        <ChatSessionView key={childSessionId} chatId={childSessionId} readOnly />
      </div>
    </aside>
  );
}

type SubAgentPanelHeaderProps = {
  sessionId: string;
  onClose: () => void;
};

function SubAgentPanelHeader({ sessionId, onClose }: SubAgentPanelHeaderProps) {
  const [title, setTitle] = useState(sessionId);

  useEffect(() => {
    let alive = true;
    void getSession(sessionId)
      .then((session) => {
        if (alive && session?.title) {
          setTitle(session.title);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sessionId]);

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
        {title}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="关闭面板"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
