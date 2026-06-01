import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useAppWindow() {
  const [appWindow] = useState<Window | null>(() =>
    isTauri() ? getCurrentWindow() : null,
  );

  return appWindow;
}

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
      className="flex h-full shrink-0 items-stretch"
      data-tauri-drag-region={false}
      onMouseDown={handleMouseDown}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-full w-11 rounded-none text-muted-foreground hover:bg-muted"
        aria-label="最小化"
        onClick={() => {
          void appWindow.minimize();
        }}
      >
        <Minus className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-full w-11 rounded-none text-muted-foreground hover:bg-muted"
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
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(
          "h-full w-11 rounded-none text-muted-foreground hover:bg-destructive hover:text-destructive-foreground",
        )}
        aria-label="关闭"
        onClick={() => {
          void appWindow.close();
        }}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
