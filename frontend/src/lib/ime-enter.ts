import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** W3C VK_PROCESS — Safari/WKWebView IME (e.g. 微信输入法) uses this for Enter confirm. */
const IME_PROCESSING_KEY_CODE = 229;

export function isImeProcessingEnter(
  event: ReactKeyboardEvent | KeyboardEvent,
  isComposing: boolean
): boolean {
  const native = "nativeEvent" in event ? event.nativeEvent : event;

  return (
    isComposing ||
    native.isComposing ||
    native.keyCode === IME_PROCESSING_KEY_CODE ||
    native.key === "Process"
  );
}

export function registerImeEnterSuppression(target: EventTarget): void {
  const suppressImeEnter: EventListener = (event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    target.removeEventListener("keydown", suppressImeEnter, true);
  };

  target.addEventListener("keydown", suppressImeEnter, true);
  window.setTimeout(() => {
    target.removeEventListener("keydown", suppressImeEnter, true);
  }, 0);
}
