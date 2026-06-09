"use client";

import { useCallback, useMemo, useState } from "react";

export type FilePreviewTab = {
  path: string;
  name: string;
};

type UseFilePreviewTabsResult = {
  tabs: FilePreviewTab[];
  activeTabPath: string | null;
  isExplorerActive: boolean;
  openFile: (file: FilePreviewTab) => void;
  closeFile: (path: string) => void;
  showExplorer: () => void;
  activateFile: (path: string) => void;
};

export function useFilePreviewTabs(): UseFilePreviewTabsResult {
  const [tabs, setTabs] = useState<FilePreviewTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  const openFile = useCallback((file: FilePreviewTab) => {
    setTabs((current) => {
      if (current.some((tab) => tab.path === file.path)) {
        return current;
      }

      return [...current, file];
    });
    setActiveTabPath(file.path);
  }, []);

  const closeFile = useCallback((path: string) => {
    setTabs((current) => {
      const nextTabs = current.filter((tab) => tab.path !== path);

      setActiveTabPath((active) => {
        if (active !== path) {
          return active;
        }

        if (nextTabs.length === 0) {
          return null;
        }

        const index = current.findIndex((tab) => tab.path === path);
        return (
          nextTabs[index]?.path ??
          nextTabs[index - 1]?.path ??
          nextTabs[0]?.path ??
          null
        );
      });

      return nextTabs;
    });
  }, []);

  const showExplorer = useCallback(() => {
    setActiveTabPath(null);
  }, []);

  const activateFile = useCallback((path: string) => {
    setActiveTabPath(path);
  }, []);

  return useMemo(
    () => ({
      tabs,
      activeTabPath,
      isExplorerActive: activeTabPath === null,
      openFile,
      closeFile,
      showExplorer,
      activateFile,
    }),
    [
      activateFile,
      activeTabPath,
      closeFile,
      openFile,
      showExplorer,
      tabs,
    ]
  );
}
