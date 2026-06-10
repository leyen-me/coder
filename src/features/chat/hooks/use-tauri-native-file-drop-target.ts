import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, type RefObject } from "react";

import {
  dragDropEventHasPosition,
  isDropOverElement,
  setNativeFileDropHover,
} from "@/lib/dnd/tauri-native-file-drop";

export function useTauriNativeFileDropTarget(
  ref: RefObject<HTMLElement | null>,
  onDrop: (paths: string[]) => void
): void {
  const onDropRef = useRef(onDrop);
  const scaleFactorRef = useRef(1);

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlisten: (() => void) | null = null;
    let disposed = false;

    void (async () => {
      try {
        scaleFactorRef.current = await getCurrentWindow().scaleFactor();
      } catch {
        scaleFactorRef.current = window.devicePixelRatio || 1;
      }

      if (disposed) {
        return;
      }

      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const element = ref.current;
        const { payload } = event;

        if (payload.type === "leave") {
          setNativeFileDropHover(element, false);
          return;
        }

        if (!dragDropEventHasPosition(payload)) {
          return;
        }

        const hovering = isDropOverElement(
          element,
          payload.position,
          scaleFactorRef.current
        );

        if (payload.type === "over") {
          setNativeFileDropHover(element, hovering);
          return;
        }

        if (payload.type === "drop") {
          setNativeFileDropHover(element, false);
          if (hovering && payload.paths.length > 0) {
            onDropRef.current(payload.paths);
          }
        }
      });
    })();

    return () => {
      disposed = true;
      setNativeFileDropHover(ref.current, false);
      unlisten?.();
    };
  }, [ref]);
}
