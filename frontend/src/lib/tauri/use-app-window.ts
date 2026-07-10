import { type Window } from "@tauri-apps/api/window";
import { useState } from "react";

import { getAppWindowOrNull } from "./app-window";

/** Stable reference to the current desktop window for the lifetime of the component tree. */
export function useAppWindow(): Window | null {
  const [appWindow] = useState(getAppWindowOrNull);
  return appWindow;
}
