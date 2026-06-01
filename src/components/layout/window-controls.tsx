import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

function useAppWindow() {
  const [appWindow] = useState<Window | null>(() =>
    isTauri() ? getCurrentWindow() : null,
  );

  return appWindow;
}

const controlButtonClass =
  "inline-flex h-11 w-[46px] shrink-0 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none dark:hover:bg-foreground/10";

export function WindowControls() {
  const appWindow = useAppWindow();
  const [isMaximized, setIsMaximized] = useState(false);

  const syncMaximized = useCallback(async () => {
    if (!appWindow) {
      return;
    }

    setIsMaximized(await appWindow.isMaximized());
  }, [appWindow]);

  useEffect(() => {
    if (!appWindow) {
      return;
    }

    void syncMaximized();

    let unlisten: (() => void) | undefined;
    void appWindow.onResized(() => {
      void syncMaximized();
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, [appWindow, syncMaximized]);

  if (!appWindow) {
    return null;
  }

  const handleMouseDown = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      className="flex h-11 shrink-0 items-stretch"
      data-tauri-drag-region={false}
      onMouseDown={handleMouseDown}
    >
      <button
        type="button"
        className={controlButtonClass}
        aria-label="最小化"
        onClick={() => {
          void appWindow.minimize();
        }}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        className={controlButtonClass}
        aria-label={isMaximized ? "还原" : "最大化"}
        onClick={() => {
          void appWindow.toggleMaximize();
        }}
      >
        {isMaximized ? (
          <Copy className="size-3.5" />
        ) : (
          <Square className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        className={cn(
          controlButtonClass,
          "hover:bg-[#c42b1c] hover:text-white dark:hover:bg-[#c42b1c] dark:hover:text-white",
        )}
        aria-label="关闭"
        onClick={() => {
          void appWindow.close();
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
