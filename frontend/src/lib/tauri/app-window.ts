import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";

/** Returns the current Tauri window, or `null` when running outside the desktop shell. */
export function getAppWindowOrNull(): Window | null {
  return isTauri() ? getCurrentWindow() : null;
}
