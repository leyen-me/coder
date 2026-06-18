"use client";

import { useCallback, useRef, useState } from "react";

export type FileEditorSession = {
  isDirty: () => boolean;
  save: () => Promise<boolean>;
  isSaving: boolean;
  saveErrorKey: string | null;
  saveErrorMessage: string | null;
  onReload: (() => void) | null;
};

type PendingClose = {
  path: string;
  fileName: string;
};

export function useFileEditorSessions() {
  const sessionsRef = useRef<Map<string, FileEditorSession>>(new Map());
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const setSession = useCallback((path: string, session: FileEditorSession | null) => {
    if (session) {
      sessionsRef.current.set(path, session);
      return;
    }

    sessionsRef.current.delete(path);
  }, []);

  const createRequestClose = useCallback(
    (closeFile: (path: string) => void) =>
      (path: string, fileName?: string) => {
        const session = sessionsRef.current.get(path);
        if (session?.isDirty()) {
          setPendingClose({
            path,
            fileName: fileName ?? path.split("/").pop() ?? path,
          });
          return;
        }

        closeFile(path);
      },
    []
  );

  const dismissPendingClose = useCallback(() => {
    if (!isSaving) {
      setPendingClose(null);
    }
  }, [isSaving]);

  const confirmDiscard = useCallback(
    (closeFile: (path: string) => void) => {
      if (!pendingClose || isSaving) {
        return;
      }

      const { path } = pendingClose;
      setPendingClose(null);
      closeFile(path);
    },
    [isSaving, pendingClose]
  );

  const saveFile = useCallback(async (path: string) => {
    const session = sessionsRef.current.get(path);
    if (!session) {
      return false;
    }

    setIsSaving(true);
    try {
      return await session.save();
    } finally {
      setIsSaving(false);
    }
  }, []);

  const confirmSave = useCallback(
    async (closeFile: (path: string) => void) => {
      if (!pendingClose || isSaving) {
        return;
      }

      const { path } = pendingClose;
      const session = sessionsRef.current.get(path);
      if (!session) {
        setPendingClose(null);
        closeFile(path);
        return;
      }

      setIsSaving(true);
      try {
        const saved = await session.save();
        if (saved) {
          setPendingClose(null);
          closeFile(path);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, pendingClose]
  );

  return {
    confirmDiscard,
    confirmSave,
    createRequestClose,
    dismissPendingClose,
    isSaving,
    pendingClose,
    saveFile,
    setSession,
  };
}
