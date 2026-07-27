import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAgentStore, useStreamingMessageOverlays } from "@/features/agent/store/agent-store";
import type { StreamingFields } from "@/features/agent/streaming-buffer";
import type { ActiveTaskState, AgentStatus } from "@/features/agent/types";
import {
  getMessagesBySession,
  getSession,
  subscribeDb,
  type MessageRecord,
  type SessionRecord,
} from "@/lib/db";
import { getAgentSessionStatus } from "@/features/agent/runner";

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
    message.thinking.length > cached.thinking.length ||
    (message.processSteps?.length ?? 0) > (cached.processSteps?.length ?? 0) ||
    (message.toolInvocations?.length ?? 0) > (cached.toolInvocations?.length ?? 0)
  );
}

function isActiveAgentTask(status: AgentStatus): boolean {
  return (
    status !== "completed" &&
    status !== "cancelled" &&
    status !== "failed" &&
    status !== "cancelling"
  );
}

/** Keep in-flight user/assistant rows visible before DB refresh catches up. */
export function mergeActiveAssistantPlaceholders(
  messages: MessageRecord[],
  activeTasks: ReadonlyMap<string, ActiveTaskState>,
  sessionId: string | undefined
): MessageRecord[] {
  if (!sessionId) {
    return messages;
  }

  const messageIds = new Set(messages.map((message) => message.id));
  const placeholders: MessageRecord[] = [];

  for (const task of activeTasks.values()) {
    if (task.sessionId !== sessionId || !isActiveAgentTask(task.status)) {
      continue;
    }

    const placeholderCreatedAt = Date.now();

    if (task.userMessageId && !messageIds.has(task.userMessageId)) {
      placeholders.push({
        id: task.userMessageId,
        sessionId: task.sessionId,
        role: "user",
        content: task.userContent,
        thinking: "",
        processSteps: [],
        toolInvocations: [],
        status: "completed",
        taskId: null,
        error: null,
        createdAt: placeholderCreatedAt,
      });
      messageIds.add(task.userMessageId);
    }

    if (!messageIds.has(task.assistantMessageId)) {
      placeholders.push({
        id: task.assistantMessageId,
        sessionId: task.sessionId,
        role: "assistant",
        content: "",
        thinking: "",
        processSteps: [],
        toolInvocations: [],
        status: "streaming",
        taskId: task.taskId,
        error: null,
        createdAt: placeholderCreatedAt + 1,
      });
      messageIds.add(task.assistantMessageId);
    }
  }

  if (placeholders.length === 0) {
    return messages;
  }

  return [...messages, ...placeholders];
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
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
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
      // Structural writes (new messages, tool rows, status) notify the DB.
      // Streaming token flushes stay silent, so debounced refresh is safe even
      // while an overlay is active — useDisplayMessages re-applies live tokens.
      if (hasStreamingOverlayForSessionRef.current) {
        pendingRefreshRef.current = true;
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

  // Reconcile spawn_subagent invocation statuses against the authoritative DB.
  //
  // A child spawned via spawn_subagent runs as an independent backend session.
  // If the browser is closed while the child is still running and reopened
  // later, the child's ToolCallFinished SSE is lost (the parent run is already
  // removed from the registry), so the Label would stay stuck on "running"
  // even after the child finished. The backend watcher does write the terminal
  // status into the parent message in DB, so we poll each still-running child's
  // session status and refresh once it reaches a terminal state.
  const spawnReconcileTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const spawnReconcileCancelled = useRef(false);
  useEffect(() => {
    if (!sessionId || isLoading) {
      return;
    }
    spawnReconcileCancelled.current = false;

    const RECONCILE_INTERVAL_MS = 2500;
    const MAX_ATTEMPTS = 240; // ~10 min safety cap

    const extractSpawn = (
      output: unknown,
    ): { sessionId?: string; status?: string } | null => {
      if (!output || typeof output !== "object") return null;
      const o = output as Record<string, unknown>;
      if (typeof o.sessionId === "string") {
        return {
          sessionId: o.sessionId,
          status: typeof o.status === "string" ? o.status : undefined,
        };
      }
      const data = o.data as Record<string, unknown> | undefined;
      if (data && typeof data.sessionId === "string") {
        return {
          sessionId: data.sessionId,
          status: typeof data.status === "string" ? data.status : undefined,
        };
      }
      return null;
    };

    const running: { sessionId: string; toolCallId: string }[] = [];
    for (const msg of messagesRef.current) {
      for (const inv of msg.toolInvocations ?? []) {
        if (inv.name !== "spawn_subagent") continue;
        const spawn = extractSpawn(inv.output);
        if (!spawn?.sessionId) continue;
        if (spawn.status && spawn.status !== "running") continue;
        if (spawnReconcileTimers.current.has(inv.id)) continue;
        running.push({
          sessionId: spawn.sessionId,
          toolCallId: inv.id,
        });
      }
    }

    running.forEach(({ sessionId: childSessionId, toolCallId }) => {
      let attempts = 0;
      const poll = async () => {
        if (spawnReconcileCancelled.current) return;
        attempts += 1;
        try {
          const statusResp = await getAgentSessionStatus(childSessionId);
          const s = statusResp?.status;
          if (s && s !== "running" && s !== "streaming" && s !== "pending") {
            spawnReconcileTimers.current.delete(toolCallId);
            // Re-read the parent message from DB where the watcher already wrote
            // the terminal status onto the spawn_subagent invocation.
            void refresh();
            return;
          }
        } catch {
          // ignore and retry
        }
        if (attempts >= MAX_ATTEMPTS) {
          spawnReconcileTimers.current.delete(toolCallId);
          return;
        }
        const timer = setTimeout(poll, RECONCILE_INTERVAL_MS);
        spawnReconcileTimers.current.set(toolCallId, timer);
      };
      const timer = setTimeout(poll, RECONCILE_INTERVAL_MS);
      spawnReconcileTimers.current.set(toolCallId, timer);
    });

    return () => {
      spawnReconcileCancelled.current = true;
      for (const timer of spawnReconcileTimers.current.values()) {
        clearTimeout(timer);
      }
      spawnReconcileTimers.current.clear();
    };
  }, [sessionId, isLoading, refresh]);

  return { session, messages, isLoading, refresh };
}

export function useDisplayMessages(messages: MessageRecord[]) {
  const { activeTasks } = useAgentStore();
  const streamingOverlays = useStreamingMessageOverlays();
  const sessionId = useMemo(() => {
    if (messages.length > 0) {
      return messages[0]?.sessionId;
    }

    for (const task of activeTasks.values()) {
      if (isActiveAgentTask(task.status)) {
        return task.sessionId;
      }
    }

    return undefined;
  }, [activeTasks, messages]);
  const messagesWithPlaceholders = useMemo(
    () => mergeActiveAssistantPlaceholders(messages, activeTasks, sessionId),
    [activeTasks, messages, sessionId]
  );
  const messageIndexById = useMemo(
    () => buildMessageIndexById(messagesWithPlaceholders),
    [messagesWithPlaceholders]
  );
  // Cache the last known overlay content per message. When an overlay is removed
  // but the DB content is still stale (async refresh in flight), continue using
  // the cached value so the UI doesn't flash empty content.
  const cachedOverlaysRef = useRef(new Map<string, StreamingFields>());

  return useMemo(() => {
    const applied = applyStreamingOverlays(
      messagesWithPlaceholders,
      streamingOverlays,
      messageIndexById
    );
    let nextMessages: MessageRecord[] | null =
      applied === messagesWithPlaceholders ? null : applied.slice();

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

      const message = messagesWithPlaceholders[messageIndex];
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
        nextMessages = messagesWithPlaceholders.slice();
      }
      nextMessages[messageIndex] = { ...message, ...cached };
    }

    return nextMessages ?? applied;
  }, [messageIndexById, messagesWithPlaceholders, streamingOverlays]);
}

/** @deprecated Prefer `useSessionData` + `useDisplayMessages` for narrower subscriptions. */
export function useSessionMessages(sessionId: string) {
  const { session, messages, isLoading, refresh } = useSessionData(sessionId);
  const displayMessages = useDisplayMessages(messages);

  return { session, messages: displayMessages, isLoading, refresh };
}
