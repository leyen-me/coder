import { useCallback, useSyncExternalStore } from "react";

import { readPromptRefineEnabled, writePromptRefineEnabled } from "./storage";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function usePromptRefineEnabled() {
  const enabled = useSyncExternalStore(
    subscribe,
    readPromptRefineEnabled,
    readPromptRefineEnabled
  );

  const setEnabled = useCallback((value: boolean) => {
    writePromptRefineEnabled(value);
    window.dispatchEvent(new Event("storage"));
  }, []);

  return { enabled, setEnabled };
}
