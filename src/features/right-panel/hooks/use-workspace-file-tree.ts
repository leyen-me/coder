"use client";

import type { ListDirEntry } from "@/features/agent/tools/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listWorkspaceDir } from "../lib/list-workspace-dir";
import { normalizeTreePath, ROOT_PATH } from "../lib/workspace-path-utils";

export type UseWorkspaceFileTreeResult = {
  rootPath: string | null;
  entriesByPath: Map<string, ListDirEntry[]>;
  expanded: Set<string>;
  selectedPath: string | undefined;
  showHidden: boolean;
  loading: boolean;
  error: string | null;
  setSelectedPath: (path: string | undefined) => void;
  handleExpandedChange: (nextExpanded: Set<string>) => void;
  refresh: (options?: { preserveExpanded?: boolean }) => void;
  reloadPaths: (paths: string[]) => Promise<void>;
  collapseAll: () => void;
  ensureExpanded: (path: string) => void;
  renameExpandedPath: (oldPath: string, newPath: string) => void;
  removeExpandedPath: (path: string) => void;
  toggleShowHidden: () => void;
  isExpanded: (path: string) => boolean;
  toggleExpanded: (path: string) => void;
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
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const directoryRequestIdsRef = useRef(new Map<string, number>());
  const expandedRef = useRef(expanded);
  const showHiddenRef = useRef(showHidden);
  const entriesByPathRef = useRef(entriesByPath);

  expandedRef.current = expanded;
  showHiddenRef.current = showHidden;
  entriesByPathRef.current = entriesByPath;

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!workspaceDir) {
        return;
      }

      const cacheKey = normalizeTreePath(path);
      const requestId =
        (directoryRequestIdsRef.current.get(cacheKey) ?? 0) + 1;
      directoryRequestIdsRef.current.set(cacheKey, requestId);
      const isRootLoad = cacheKey === ROOT_PATH;
      if (isRootLoad && !entriesByPathRef.current.has(ROOT_PATH)) {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await listWorkspaceDir(
          workspaceDir,
          cacheKey,
          showHiddenRef.current
        );
        if (directoryRequestIdsRef.current.get(cacheKey) !== requestId) {
          return;
        }

        setEntriesByPath((current) => {
          const next = new Map(current);
          next.set(cacheKey, data.entries);
          return next;
        });
      } catch (loadError) {
        if (directoryRequestIdsRef.current.get(cacheKey) !== requestId) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : String(loadError);
        setError(message);
      } finally {
        if (
          directoryRequestIdsRef.current.get(cacheKey) === requestId &&
          isRootLoad
        ) {
          setLoading(false);
        }
      }
    },
    [workspaceDir]
  );

  const refresh = useCallback(
    (options?: { preserveExpanded?: boolean }) => {
      if (!workspaceDir) {
        setRootPath(null);
        setEntriesByPath(new Map());
        setExpanded(new Set());
        setSelectedPath(undefined);
        setError(null);
        return;
      }

      const preserveExpanded = options?.preserveExpanded ?? false;
      const expandedPaths = preserveExpanded
        ? [...expandedRef.current]
        : [];

      setRootPath(ROOT_PATH);
      setEntriesByPath(new Map());
      if (!preserveExpanded) {
        setExpanded(new Set());
      }
      setSelectedPath(undefined);

      void (async () => {
        await loadDirectory(ROOT_PATH);
        if (preserveExpanded) {
          await Promise.all(expandedPaths.map((path) => loadDirectory(path)));
        }
      })();
    },
    [loadDirectory, workspaceDir]
  );

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

  const reloadPaths = useCallback(
    async (paths: string[]) => {
      if (!workspaceDir) {
        return;
      }

      const uniquePaths = [...new Set(paths.map(normalizeTreePath))];

      await Promise.all(
        uniquePaths.map(async (cacheKey) => {
          await loadDirectory(cacheKey);
        })
      );
    },
    [loadDirectory, workspaceDir]
  );

  const ensureExpanded = useCallback(
    (path: string) => {
      const cacheKey = normalizeTreePath(path);
      setExpanded((current) => {
        if (current.has(cacheKey)) {
          return current;
        }
        const next = new Set(current);
        next.add(cacheKey);
        return next;
      });
      if (!entriesByPathRef.current.has(cacheKey)) {
        void loadDirectory(cacheKey);
      }
    },
    [loadDirectory]
  );

  const renameExpandedPath = useCallback((oldPath: string, newPath: string) => {
    const normalizedOld = normalizeTreePath(oldPath);
    const normalizedNew = normalizeTreePath(newPath);
    const oldPrefix = `${normalizedOld}/`;

    setExpanded((current) => {
      const next = new Set<string>();
      for (const path of current) {
        if (path === normalizedOld) {
          next.add(normalizedNew);
        } else if (path.startsWith(oldPrefix)) {
          next.add(`${normalizedNew}/${path.slice(oldPrefix.length)}`);
        } else {
          next.add(path);
        }
      }
      return next;
    });

    setEntriesByPath((current) => {
      const next = new Map<string, ListDirEntry[]>();
      for (const [cacheKey, entries] of current) {
        if (cacheKey === normalizedOld) {
          next.set(normalizedNew, entries);
        } else if (cacheKey.startsWith(oldPrefix)) {
          next.set(
            `${normalizedNew}/${cacheKey.slice(oldPrefix.length)}`,
            entries
          );
        } else {
          next.set(cacheKey, entries);
        }
      }
      return next;
    });
  }, []);

  const removeExpandedPath = useCallback((path: string) => {
    const normalized = normalizeTreePath(path);
    const prefix = `${normalized}/`;

    setExpanded((current) => {
      const next = new Set<string>();
      for (const expandedPath of current) {
        if (expandedPath !== normalized && !expandedPath.startsWith(prefix)) {
          next.add(expandedPath);
        }
      }
      return next;
    });

    setEntriesByPath((current) => {
      const next = new Map<string, ListDirEntry[]>();
      for (const [cacheKey, entries] of current) {
        if (cacheKey !== normalized && !cacheKey.startsWith(prefix)) {
          next.set(cacheKey, entries);
        }
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const toggleShowHidden = useCallback(() => {
    setShowHidden((current) => !current);
    setEntriesByPath(new Map());
    if (workspaceDir) {
      void loadDirectory(ROOT_PATH);
      for (const path of expandedRef.current) {
        void loadDirectory(path);
      }
    }
  }, [loadDirectory, workspaceDir]);

  const isExpanded = useCallback(
    (path: string) => expanded.has(normalizeTreePath(path)),
    [expanded]
  );

  const toggleExpanded = useCallback(
    (path: string) => {
      const cacheKey = normalizeTreePath(path);
      const nextExpanded = new Set(expanded);
      if (nextExpanded.has(cacheKey)) {
        nextExpanded.delete(cacheKey);
      } else {
        nextExpanded.add(cacheKey);
      }
      handleExpandedChange(nextExpanded);
    },
    [expanded, handleExpandedChange]
  );

  return useMemo(
    () => ({
      rootPath,
      entriesByPath,
      expanded,
      selectedPath,
      showHidden,
      loading,
      error,
      setSelectedPath,
      handleExpandedChange,
      refresh,
      reloadPaths,
      collapseAll,
      ensureExpanded,
      renameExpandedPath,
      removeExpandedPath,
      toggleShowHidden,
      isExpanded,
      toggleExpanded,
    }),
    [
      collapseAll,
      ensureExpanded,
      entriesByPath,
      error,
      expanded,
      handleExpandedChange,
      isExpanded,
      loading,
      refresh,
      reloadPaths,
      removeExpandedPath,
      renameExpandedPath,
      rootPath,
      selectedPath,
      showHidden,
      toggleExpanded,
      toggleShowHidden,
    ]
  );
}
