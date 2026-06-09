"use client";

import type { ListDirEntry } from "@/features/agent/tools/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listWorkspaceDir } from "../lib/list-workspace-dir";

const ROOT_PATH = ".";

function normalizeTreePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  return trimmed.length === 0 ? ROOT_PATH : trimmed;
}

type UseWorkspaceFileTreeResult = {
  rootPath: string | null;
  entriesByPath: Map<string, ListDirEntry[]>;
  expanded: Set<string>;
  selectedPath: string | undefined;
  loading: boolean;
  error: string | null;
  setSelectedPath: (path: string | undefined) => void;
  handleExpandedChange: (nextExpanded: Set<string>) => void;
  refresh: () => void;
};

export function useWorkspaceFileTree(
  workspaceDir: string | null
): UseWorkspaceFileTreeResult {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [entriesByPath, setEntriesByPath] = useState<
    Map<string, ListDirEntry[]>
  >(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!workspaceDir) {
        return;
      }

      const cacheKey = normalizeTreePath(path);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setLoading(true);
      setError(null);

      try {
        const data = await listWorkspaceDir(workspaceDir, cacheKey);
        if (requestIdRef.current !== requestId) {
          return;
        }

        setEntriesByPath((current) => {
          const next = new Map(current);
          next.set(cacheKey, data.entries);
          return next;
        });
      } catch (loadError) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : String(loadError);
        setError(message);
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [workspaceDir]
  );

  const refresh = useCallback(() => {
    if (!workspaceDir) {
      setRootPath(null);
      setEntriesByPath(new Map());
      setExpanded(new Set());
      setSelectedPath(undefined);
      setError(null);
      return;
    }

    setRootPath(ROOT_PATH);
    setEntriesByPath(new Map());
    setExpanded(new Set());
    setSelectedPath(undefined);
    void loadDirectory(ROOT_PATH);
  }, [loadDirectory, workspaceDir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleExpandedChange = useCallback(
    (nextExpanded: Set<string>) => {
      setExpanded(nextExpanded);

      if (!workspaceDir) {
        return;
      }

      for (const path of nextExpanded) {
        const cacheKey = normalizeTreePath(path);
        if (!entriesByPath.has(cacheKey)) {
          void loadDirectory(cacheKey);
        }
      }
    },
    [entriesByPath, loadDirectory, workspaceDir]
  );

  return useMemo(
    () => ({
      rootPath,
      entriesByPath,
      expanded,
      selectedPath,
      loading,
      error,
      setSelectedPath,
      handleExpandedChange,
      refresh,
    }),
    [
      entriesByPath,
      error,
      expanded,
      handleExpandedChange,
      loading,
      refresh,
      rootPath,
      selectedPath,
    ]
  );
}
