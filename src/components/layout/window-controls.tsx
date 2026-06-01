import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function WindowControls() {
  if (!isTauri()) {
    return null;
  }

  const appWindow = getCurrentWindow();

  return (
    <div className="flex h-full shrink-0 items-stretch">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-full w-11 rounded-none text-muted-foreground hover:bg-muted"
        aria-label="最小化"
        onClick={() => appWindow.minimize()}
      >
        <Minus className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-full w-11 rounded-none text-muted-foreground hover:bg-muted"
        aria-label="最大化"
        onClick={() => appWindow.toggleMaximize()}
      >
        <Square className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-full w-11 rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="关闭"
        onClick={() => appWindow.close()}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
