import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useStreamingMessageOverlays } from "@/features/agent/store/agent-store";
import type { StreamingFields } from "@/features/agent/streaming-buffer";
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

export function hasStreamingOverlayCaughtUp(
  message: MessageRecord,
  cached: StreamingFields
): boolean {
  return (
    message.content === cached.content &&
    message.thinking === cached.thinking &&
    JSON.stringify(message.processSteps ?? []) ===
      JSON.stringify(cached.processSteps ?? []) &&
    JSON.stringify(message.toolInvocations ?? []) ===
      JSON.stringify(cached.toolInvocations ?? [])
  );
}

/** True when IndexedDB already has more streamed text than the cached overlay snapshot. */
export function isCachedStreamingOverlayBehindDb(
  message: MessageRecord,
  cached: StreamingFields
): boolean {
  return (
    message.content.length > cached.content.length ||
    message.thinking.length > cached.thinking.length
  );
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
  const refreshGenerationRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const bumpRefreshGeneration = useCallback(() => {
    refreshGenerationRef.current += 1;
    return refreshGenerationRef.current;
  }, []);
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
    (
      id: string,
      generation: number,
      data: Awaited<ReturnType<typeof fetchSessionData>>
    ) => {
      if (id !== sessionIdRef.current) {
        return;
      }
      if (generation !== refreshGenerationRef.current) {
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
      bumpRefreshGeneration();
      setSession(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const generation = bumpRefreshGeneration();
    const data = await fetchSessionData(id);
    applySessionData(id, generation, data);
  }, [applySessionData, bumpRefreshGeneration]);

  useEffect(() => {
    let active = true;

    pendingRefreshRef.current = false;
    const generation = bumpRefreshGeneration();
    setIsLoading(true);
    setSession(null);
    setMessages([]);

    void (async () => {
      const data = await fetchSessionData(sessionId);
      if (!active) {
        return;
      }
      applySessionData(sessionId, generation, data);
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
        const debouncedGeneration = bumpRefreshGeneration();
        void (async () => {
          const data = await fetchSessionData(sessionId);
          if (!active) {
            return;
          }
          applySessionData(sessionId, debouncedGeneration, data);
        })();
      }, DB_REFRESH_DEBOUNCE_MS);
    });

    return () => {
      active = false;
      bumpRefreshGeneration();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [sessionId, applySessionData, bumpRefreshGeneration]);

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
  // Cache the last known overlay content per message. When an overlay is removed
  // but the DB content is still stale (async refresh in flight), continue using
  // the cached value so the UI doesn't flash empty content.
  const cachedOverlaysRef = useRef(new Map<string, StreamingFields>());

  return useMemo(() => {
    const applied = applyStreamingOverlays(messages, streamingOverlays, messageIndexById);
    let nextMessages: MessageRecord[] | null =
      applied === messages ? null : applied.slice();

    // Update cache with active overlay values.
    for (const [messageId, overlay] of streamingOverlays) {
      cachedOverlaysRef.current.set(messageId, overlay);
    }

    // For messages that lost their overlay but still have empty/stale content
    // in the DB, fall back to the cached overlay until the DB catches up.
    for (const [messageId, cached] of cachedOverlaysRef.current) {
      if (streamingOverlays.has(messageId)) {
        continue; // overlay is still active
      }

      const messageIndex = messageIndexById.get(messageId);
      if (messageIndex === undefined) {
        cachedOverlaysRef.current.delete(messageId);
        continue; // message no longer in the list
      }

      const message = messages[messageIndex];
      if (hasStreamingOverlayCaughtUp(message, cached)) {
        cachedOverlaysRef.current.delete(messageId);
        continue; // DB has caught up, drop the cache
      }

      if (isCachedStreamingOverlayBehindDb(message, cached)) {
        // Overlay stopped early but the DB refresh already has newer text.
        // Never clobber fresher DB content with a stale cached overlay.
        cachedOverlaysRef.current.delete(messageId);
        continue;
      }

      // DB is still stale — apply cached overlay
      if (!nextMessages) {
        nextMessages = messages.slice();
      }
      nextMessages[messageIndex] = { ...message, ...cached };
    }

    return nextMessages ?? applied;
  }, [messages, messageIndexById, streamingOverlays]);
}

/** @deprecated Prefer `useSessionData` + `useDisplayMessages` for narrower subscriptions. */
export function useSessionMessages(sessionId: string) {
  const { session, messages, isLoading, refresh } = useSessionData(sessionId);
  const displayMessages = useDisplayMessages(messages);

  return { session, messages: displayMessages, isLoading, refresh };
}
