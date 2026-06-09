import { useEffect, type Dispatch, type SetStateAction } from "react";

import {
  appendFileMention,
  focusComposerTextarea,
  getLatestComposerInsert,
  useComposerInsertVersion,
} from "../lib/composer-insert-store";

export function useComposerInsert(
  setPrompt: Dispatch<SetStateAction<string>>
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

    setPrompt((prev) => appendFileMention(prev, payload.path));

    if (payload.focus) {
      requestAnimationFrame(() => {
        focusComposerTextarea();
      });
    }
  }, [version, setPrompt]);
}
