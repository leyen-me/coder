import { useCallback, useEffect, useState } from "react";

import {
  getMessagesBySession,
  getSession,
  subscribeDb,
  type MessageRecord,
  type SessionRecord,
} from "@/lib/db";

export function useSessionMessages(sessionId: string) {
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

  return { session, messages, isLoading, refresh };
}
