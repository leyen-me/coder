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

function buildMessageIndexById(messages: readonly MessageRecord[]) {
  const indexById = new Map<string, number>();
  for (let index = 0; index < messages.length; index += 1) {
    indexById.set(messages[index].id, index);
  }
  return indexById;
}

function applyStreamingOverlays(
  messages: MessageRecord[],
  overlays: ReadonlyMap<
    string,
    {
      content: string;
      thinking: string;
      processSteps: MessageRecord["processSteps"];
      toolInvocations: MessageRecord["toolInvocations"];
    }
  >,
  messageIndexById: ReadonlyMap<string, number>
): MessageRecord[] {
  if (overlays.size === 0 || messages.length === 0) {
    return messages;
  }

  let nextMessages: MessageRecord[] | null = null;
  for (const [messageId, overlay] of overlays) {
    const messageIndex = messageIndexById.get(messageId);
    if (messageIndex === undefined) {
      continue;
    }

    const message = messages[messageIndex];
    if (message.role !== "assistant") {
      continue;
    }

    if (
      message.content === overlay.content &&
      message.thinking === overlay.thinking &&
      message.processSteps === overlay.processSteps &&
      message.toolInvocations === overlay.toolInvocations
    ) {
      continue;
    }

    if (nextMessages === null) {
      nextMessages = messages.slice();
    }

    nextMessages[messageIndex] = {
      ...message,
      content: overlay.content,
      thinking: overlay.thinking,
      processSteps: overlay.processSteps,
      toolInvocations: overlay.toolInvocations,
    };
  }

  return nextMessages ?? messages;
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
  const streamingOverlays = useStreamingMessageOverlays();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const messageIndexById = useMemo(() => buildMessageIndexById(messages), [messages]);
  const hasStreamingOverlayForSession = useMemo(() => {
    if (streamingOverlays.size === 0 || messageIndexById.size === 0) {
      return false;
    }

    for (const messageId of streamingOverlays.keys()) {
      if (messageIndexById.has(messageId)) {
        return true;
      }
    }

    return false;
  }, [messageIndexById, streamingOverlays]);
  const hasStreamingOverlayForSessionRef = useRef(hasStreamingOverlayForSession);
  hasStreamingOverlayForSessionRef.current = hasStreamingOverlayForSession;

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

    pendingRefreshRef.current = false;
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
      if (hasStreamingOverlayForSessionRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

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

  useEffect(() => {
    if (hasStreamingOverlayForSession || !pendingRefreshRef.current) {
      return;
    }

    pendingRefreshRef.current = false;
    void refresh();
  }, [hasStreamingOverlayForSession, refresh]);

  return { session, messages, isLoading, refresh };
}

export function useDisplayMessages(messages: MessageRecord[]) {
  const streamingOverlays = useStreamingMessageOverlays();
  const messageIndexById = useMemo(() => buildMessageIndexById(messages), [messages]);

  return useMemo(
    () => applyStreamingOverlays(messages, streamingOverlays, messageIndexById),
    [messages, messageIndexById, streamingOverlays]
  );
}

/** @deprecated Prefer `useSessionData` + `useDisplayMessages` for narrower subscriptions. */
export function useSessionMessages(sessionId: string) {
  const { session, messages, isLoading, refresh } = useSessionData(sessionId);
  const displayMessages = useDisplayMessages(messages);

  return { session, messages: displayMessages, isLoading, refresh };
}
