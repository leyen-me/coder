import { isTauri } from "@tauri-apps/api/core";
import { Copy, Minus, Square, X } from "lucide-react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import { stopMouseDownPropagation } from "@/lib/tauri/title-bar-handlers";
import { useAppWindow } from "@/lib/tauri/use-app-window";
import { useWindowMaximized } from "@/lib/tauri/use-window-maximized";

import { TITLE_BAR_HEIGHT_CLASS } from "./constants";
import { WindowControlButton } from "./window-control-button";

/** Whether native window controls are rendered in the title bar. */
export const HAS_WINDOW_CONTROLS = isTauri();

export function WindowControls() {
  const { t } = useTranslation();
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
        label={t("windowControls.minimize")}
        onClick={() => {
          void appWindow.minimize();
        }}
      >
        <Minus className="size-4" />
      </WindowControlButton>

      <WindowControlButton
        label={
          isMaximized
            ? t("windowControls.restore")
            : t("windowControls.maximize")
        }
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
        label={t("windowControls.close")}
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
