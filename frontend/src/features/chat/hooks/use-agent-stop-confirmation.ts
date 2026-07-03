import { useCallback, useEffect, useRef, useState } from "react";

export const AGENT_STOP_CONFIRM_TIMEOUT_MS = 3000;

export function useAgentStopConfirmation(onStop: () => void) {
  const [isPending, setIsPending] = useState(false);
  const isPendingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    isPendingRef.current = false;
    setIsPending(false);
  }, []);

  const confirmStop = useCallback(() => {
    clearPending();
    onStop();
  }, [clearPending, onStop]);

  const requestStop = useCallback(() => {
    if (isPendingRef.current) {
      confirmStop();
      return;
    }

    isPendingRef.current = true;
    setIsPending(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      isPendingRef.current = false;
      setIsPending(false);
      timeoutRef.current = null;
    }, AGENT_STOP_CONFIRM_TIMEOUT_MS);
  }, [confirmStop]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isPending,
    requestStop,
    confirmStop,
    dismissStopConfirm: clearPending,
  };
}
