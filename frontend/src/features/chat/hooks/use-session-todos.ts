import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAgentTodosBySession,
  subscribeDb,
  type AgentTodoRecord,
} from "@/lib/db";

const DB_REFRESH_DEBOUNCE_MS = 150;

export function useSessionTodos(sessionId: string) {
  const [todos, setTodos] = useState<AgentTodoRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const refresh = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) {
      setTodos([]);
      setIsLoading(false);
      return;
    }

    const nextTodos = await getAgentTodosBySession(id);
    if (id !== sessionIdRef.current) {
      return;
    }

    setTodos(nextTodos);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setTodos([]);

    void (async () => {
      if (!sessionId) {
        if (active) {
          setTodos([]);
          setIsLoading(false);
        }
        return;
      }

      const nextTodos = await getAgentTodosBySession(sessionId);
      if (!active) {
        return;
      }

      setTodos(nextTodos);
      setIsLoading(false);
    })();

    const unsubscribe = subscribeDb(() => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        if (!active) {
          return;
        }
        void refresh();
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
  }, [sessionId, refresh]);

  return { todos, isLoading, refresh };
}
