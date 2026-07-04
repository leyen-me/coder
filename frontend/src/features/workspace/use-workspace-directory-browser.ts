import { useCallback, useEffect, useState } from "react";

import { browseDirectories, type BrowseDirectoriesResult } from "./browse-directories";

type WorkspaceDirectoryBrowserState = {
  currentPath: string;
  parent: string | null;
  entries: BrowseDirectoriesResult["entries"];
  loading: boolean;
  error: string | null;
};

const EMPTY_STATE: WorkspaceDirectoryBrowserState = {
  currentPath: "",
  parent: null,
  entries: [],
  loading: false,
  error: null,
};

async function loadDirectory(
  path?: string | null
): Promise<WorkspaceDirectoryBrowserState> {
  const result = await browseDirectories(path);
  return {
    currentPath: result.path,
    parent: result.parent,
    entries: result.entries,
    loading: false,
    error: null,
  };
}

export function useWorkspaceDirectoryBrowser(
  open: boolean,
  initialPath: string
) {
  const [state, setState] = useState<WorkspaceDirectoryBrowserState>(EMPTY_STATE);

  const navigateTo = useCallback(async (path?: string | null) => {
    setState((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));

    try {
      setState(await loadDirectory(path));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setState(EMPTY_STATE);
      return;
    }

    void (async () => {
      setState({ ...EMPTY_STATE, loading: true });
      const trimmedInitial = initialPath.trim();

      if (trimmedInitial) {
        try {
          setState(await loadDirectory(trimmedInitial));
          return;
        } catch {
          // Fall back to the root listing when the saved path is stale.
        }
      }

      try {
        setState(await loadDirectory(null));
      } catch (error) {
        setState({
          ...EMPTY_STATE,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, [initialPath, open]);

  return {
    ...state,
    navigateTo,
    goUp: () => {
      if (state.parent === null && state.currentPath) {
        void navigateTo(null);
        return;
      }

      if (state.parent !== null) {
        void navigateTo(state.parent);
        return;
      }

      void navigateTo(null);
    },
    isAtRootListing: !state.currentPath,
  };
}
