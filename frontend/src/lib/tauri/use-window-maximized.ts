import { type Window } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

async function readMaximizedState(appWindow: Window): Promise<boolean> {
  return appWindow.isMaximized();
}

/** Tracks whether the desktop window is currently maximized. */
export function useWindowMaximized(appWindow: Window | null): boolean {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) {
      return;
    }

    let disposed = false;

    const syncMaximizedState = async () => {
      const maximized = await readMaximizedState(appWindow);
      if (!disposed) {
        setIsMaximized(maximized);
      }
    };

    void syncMaximizedState();

    let unlisten: (() => void) | undefined;
    void appWindow
      .onResized(() => {
        void syncMaximizedState();
      })
      .then((dispose) => {
        unlisten = dispose;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [appWindow]);

  return isMaximized;
}
