import { useCallback, useEffect, useMemo, useState } from "react";

import { useStreamingMessageOverlays } from "@/features/agent/store/agent-store";
import {
  getMessagesBySession,
  getSession,
  subscribeDb,
  type MessageRecord,
  type SessionRecord,
} from "@/lib/db";

function applyStreamingOverlays(
  messages: MessageRecord[],
  overlays: ReadonlyMap<string, { content: string; thinking: string }>
): MessageRecord[] {
  if (overlays.size === 0) {
    return messages;
  }

  return messages.map((message) => {
    const overlay = overlays.get(message.id);
    const isStreaming =
      message.status === "pending" || message.status === "streaming";
    if (!overlay || !isStreaming) {
      return message;
    }

    return {
      ...message,
      content: overlay.content,
      thinking: overlay.thinking,
    };
  });
}

export function useSessionMessages(sessionId: string) {
  const streamingOverlays = useStreamingMessageOverlays();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      void refresh();
    });
  }, [refresh]);

  const displayMessages = useMemo(
    () => applyStreamingOverlays(messages, streamingOverlays),
    [messages, streamingOverlays]
  );

  return { session, messages: displayMessages, isLoading, refresh };
}
