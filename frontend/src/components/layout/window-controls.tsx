import { Copy, Minus, Square, X } from "lucide-react";

import { useTranslation } from "@/lib/i18n/locale-provider";

import { TITLE_BAR_HEIGHT_CLASS } from "./constants";
import { WindowControlButton } from "./window-control-button";

export function WindowControls() {
  const { t } = useTranslation();

  // Window controls are only available in the desktop app.
  return null;
}
