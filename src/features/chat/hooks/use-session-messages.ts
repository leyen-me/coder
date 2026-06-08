import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useStreamingMessageOverlays } from "@/features/agent/store/agent-store";
import {
  getMessagesBySession,
  getSession,
  subscribeDb,
  type MessageRecord,
  type SessionRecord,
} from "@/lib/db";

const DB_REFRESH_DEBOUNCE_MS = 150;

function applyStreamingOverlays(
  messages: MessageRecord[],
  overlays: ReadonlyMap<
    string,
    { content: string; thinking: string; processSteps: MessageRecord["processSteps"] }
  >
): MessageRecord[] {
  if (overlays.size === 0) {
    return messages;
  }

  let didChange = false;
  const nextMessages = messages.map((message) => {
    const overlay = overlays.get(message.id);
    const isStreaming =
      message.status === "pending" || message.status === "streaming";
    if (!overlay || !isStreaming) {
      return message;
    }

    didChange = true;
    return {
      ...message,
      content: overlay.content,
      thinking: overlay.thinking,
      processSteps: overlay.processSteps,
    };
  });

  return didChange ? nextMessages : messages;
}

export function useSessionData(sessionId: string) {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const [nextSession, nextMessages] = await Promise.all([
      getSession(sessionId),
      getMessagesBySession(sessionId),
    ]);
    setSession(nextSession);
    setMessages(nextMessages);
    setIsLoading(false);
  }, [sessionId]);

  useEffect(() => {
    setIsLoading(true);
    void refresh();

    return subscribeDb(() => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        void refresh();
      }, DB_REFRESH_DEBOUNCE_MS);
    });
  }, [refresh]);

  useEffect(
    () => () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    },
    []
  );

  return { session, messages, isLoading, refresh };
}

export function useDisplayMessages(messages: MessageRecord[]) {
  const streamingOverlays = useStreamingMessageOverlays();

  return useMemo(
    () => applyStreamingOverlays(messages, streamingOverlays),
    [messages, streamingOverlays]
  );
}

/** @deprecated Prefer `useSessionData` + `useDisplayMessages` for narrower subscriptions. */
export function useSessionMessages(sessionId: string) {
  const { session, messages, isLoading, refresh } = useSessionData(sessionId);
  const displayMessages = useDisplayMessages(messages);

  return { session, messages: displayMessages, isLoading, refresh };
}
