import { useEffect, useRef } from "react";

import { matchKeyboardEvent } from "@/lib/keyboard-shortcuts/match";
import type { ShortcutBinding } from "@/lib/keyboard-shortcuts/types";

type UseHotkeyOptions = {
  enabled?: boolean;
  preventDefault?: boolean;
};

export function useHotkey(
  binding: ShortcutBinding,
  handler: (event: KeyboardEvent) => void,
  options?: UseHotkeyOptions
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const enabled = options?.enabled ?? true;
  const preventDefault = options?.preventDefault ?? true;

  useEffect(() => {
    if (!enabled || !binding) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchKeyboardEvent(event, binding)) {
        return;
      }

      if (preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }

      handlerRef.current(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [binding, enabled, preventDefault]);
}
