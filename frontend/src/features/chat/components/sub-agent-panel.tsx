import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { ChatSessionView } from "../views/chat-session-view";
import { useSubAgentPanel } from "../store/sub-agent-panel-store";
import { getSession } from "@/lib/db/sessions";
import { cn } from "@/lib/utils";

/**
 * Right-hand panel that shows one or more SubAgent (child) sessions side by
 * side with the parent session. Clicking a SubAgent Label opens the child
 * here instead of navigating away, so the parent conversation stays visible.
 *
 * Each open child is rendered with a full `ChatSessionView` instance — it runs
 * its own `useSessionData` / `resumeSessionTask` / reconcile, fully isolated by
 * `sessionId`. The panel itself holds no session logic beyond which children
 * are open and which is active.
 */
export function SubAgentPanel() {
  const { openChildIds, activeChildId, closeChild, setActiveChild } =
    useSubAgentPanel();

  if (openChildIds.length === 0) {
    return null;
  }

  // When the active child was closed, fall back to the most recently opened.
  const active = activeChildId ?? openChildIds[openChildIds.length - 1];

  return (
    <aside className="flex h-full w-[440px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1">
        {openChildIds.map((id) => (
          <ChildTab
            key={id}
            sessionId={id}
            active={id === active}
            onSelect={() => setActiveChild(id)}
            onClose={() => closeChild(id)}
          />
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ChatSessionView key={active} chatId={active} />
      </div>
    </aside>
  );
}

type ChildTabProps = {
  sessionId: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
};

function ChildTab({ sessionId, active, onSelect, onClose }: ChildTabProps) {
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
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs",
        active ? "border-foreground/30 bg-accent" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="max-w-[160px] truncate"
        title={title}
      >
        {title}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="关闭子会话"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
