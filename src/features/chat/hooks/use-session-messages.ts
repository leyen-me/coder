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

async function fetchSessionData(sessionId: string) {
  if (!sessionId) {
    return { session: null, messages: [] as MessageRecord[] };
  }

  const [session, messages] = await Promise.all([
    getSession(sessionId),
    getMessagesBySession(sessionId),
  ]);

  return { session, messages };
}

export function useSessionData(sessionId: string) {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const applySessionData = useCallback(
    (id: string, data: Awaited<ReturnType<typeof fetchSessionData>>) => {
      if (id !== sessionIdRef.current) {
        return;
      }

      setSession(data.session);
      setMessages(data.messages);
      setIsLoading(false);
    },
    []
  );

  const refresh = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) {
      setSession(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const data = await fetchSessionData(id);
    applySessionData(id, data);
  }, [applySessionData]);

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setSession(null);
    setMessages([]);

    void (async () => {
      const data = await fetchSessionData(sessionId);
      if (!active) {
        return;
      }
      applySessionData(sessionId, data);
    })();

    const unsubscribe = subscribeDb(() => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        void (async () => {
          const data = await fetchSessionData(sessionId);
          if (!active) {
            return;
          }
          applySessionData(sessionId, data);
        })();
      }, DB_REFRESH_DEBOUNCE_MS);
    });

    return () => {
      active = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [sessionId, applySessionData]);

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
