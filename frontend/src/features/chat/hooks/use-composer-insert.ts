import { useEffect } from "react";

import {
  focusComposerEditor,
  getLatestComposerInsert,
  useComposerInsertVersion,
  type ComposerInsertPayload,
} from "../lib/composer-insert-store";

export function useComposerInsert(
  onInsert: (payload: ComposerInsertPayload) => void
): void {
  const version = useComposerInsertVersion();

  useEffect(() => {
    if (version === 0) {
      return;
    }

    const payload = getLatestComposerInsert();
    if (!payload) {
      return;
    }

    onInsert(payload);

    if (payload.focus) {
      requestAnimationFrame(() => {
        focusComposerEditor();
      });
    }
  }, [version, onInsert]);
}
