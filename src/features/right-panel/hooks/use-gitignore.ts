"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { GitignoreMatcher } from "../lib/gitignore";

const GITIGNORE_PATH = ".gitignore";

type UseGitignoreResult = {
  /** Returns `true` if the given relative path should be ignored by .gitignore. */
  isIgnored: (relativePath: string, isDir: boolean) => boolean;
  /** Whether the gitignore file has been loaded. */
  loaded: boolean;
};

/**
 * Watches the root `.gitignore` of the workspace and provides an `isIgnored()`
 * matcher function.
 *
 * The `.gitignore` is re-read when `workspaceDir` changes or when the
 * `refreshTick` counter increments.
 */
export function useGitignore(
  workspaceDir: string | null,
  refreshTick: number
): UseGitignoreResult {
  const matcherRef = useRef<GitignoreMatcher | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    matcherRef.current = null;
    setLoaded(false);

    if (!workspaceDir || !isTauri()) {
      return;
    }

    let cancelled = false;

    invoke<{ content: string }>("tool_read_file", {
      workspaceDir,
      path: GITIGNORE_PATH,
      startLine: 1,
      maxLines: 5000,
      respectGitignore: false,
      numbered: false,
    })
      .then((data) => {
        if (cancelled) return;
        matcherRef.current = GitignoreMatcher.fromContent(data.content);
        setLoaded(true);
      })
      .catch(() => {
        // .gitignore doesn't exist or can't be read — nothing is ignored
        if (cancelled) return;
        matcherRef.current = null;
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceDir, refreshTick]);

  const isIgnored = useCallback(
    (relativePath: string, isDir: boolean): boolean => {
      const matcher = matcherRef.current;
      if (!matcher) return false;
      return matcher.ignores(relativePath, isDir);
    },
    []
  );

  return { isIgnored, loaded };
}
