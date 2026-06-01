import { Copy, Minus, Square, X } from "lucide-react";

import { stopMouseDownPropagation } from "@/lib/tauri/title-bar-handlers";
import { useAppWindow } from "@/lib/tauri/use-app-window";
import { useWindowMaximized } from "@/lib/tauri/use-window-maximized";

import { TITLE_BAR_HEIGHT_CLASS } from "./constants";
import { WindowControlButton } from "./window-control-button";

export function WindowControls() {
  const appWindow = useAppWindow();
  const isMaximized = useWindowMaximized(appWindow);

  if (!appWindow) {
    return null;
  }

  return (
    <div
      className={`flex ${TITLE_BAR_HEIGHT_CLASS} shrink-0 items-stretch`}
      data-tauri-drag-region={false}
      onMouseDown={stopMouseDownPropagation}
    >
      <WindowControlButton
        label="最小化"
        onClick={() => {
          void appWindow.minimize();
        }}
      >
        <Minus className="size-4" />
      </WindowControlButton>

      <WindowControlButton
        label={isMaximized ? "还原" : "最大化"}
        onClick={() => {
          void appWindow.toggleMaximize();
        }}
      >
        {isMaximized ? (
          <Copy className="size-3.5" />
        ) : (
          <Square className="size-3.5" />
        )}
      </WindowControlButton>

      <WindowControlButton
        label="关闭"
        variant="close"
        onClick={() => {
          void appWindow.close();
        }}
      >
        <X className="size-4" />
      </WindowControlButton>
    </div>
  );
}
