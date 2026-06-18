"use client";

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";

type UseFileWatcherOptions = {
  workspaceDir: string | null;
  onFilesChanged: () => void;
  onGitChanged: () => void;
};

/**
 * Listens for file-change events emitted by the Rust file watcher.
 *
 * - `"workspace:files-changed"` → calls `onFilesChanged` (file tree refresh)
 * - `"workspace:git-changed"`   → calls `onGitChanged` (git panel refresh)
 *
 * Automatically unlistens when `workspaceDir` changes or the component unmounts.
 */
export function useFileWatcher({
  workspaceDir,
  onFilesChanged,
  onGitChanged,
}: UseFileWatcherOptions) {
  useEffect(() => {
    if (!workspaceDir) return;

    const cleanups: UnlistenFn[] = [];

    listen("workspace:files-changed", () => {
      onFilesChanged();
    }).then((unlisten) => {
      cleanups.push(unlisten);
    });

    listen("workspace:git-changed", () => {
      onGitChanged();
    }).then((unlisten) => {
      cleanups.push(unlisten);
    });

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [workspaceDir, onFilesChanged, onGitChanged]);
}
