import { useEffect, useRef, useState } from "react";

import {
  searchWorkspacePaths,
  type WorkspacePathMatch,
} from "../lib/search-workspace-paths";

const SEARCH_DEBOUNCE_MS = 200;

type UseWorkspacePathSearchResult = {
  results: WorkspacePathMatch[];
  loading: boolean;
  error: string | null;
};

export function useWorkspacePathSearch(
  workspaceDir: string | null | undefined,
  query: string,
  enabled: boolean
): UseWorkspacePathSearchResult {
  const [results, setResults] = useState<WorkspacePathMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const trimmedWorkspace = workspaceDir?.trim() ?? "";
    if (!trimmedWorkspace) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    const timeoutId = window.setTimeout(() => {
      void searchWorkspacePaths(trimmedWorkspace, query)
        .then((data) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setResults(data.matches);
          setLoading(false);
        })
        .catch((searchError) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          const message =
            searchError instanceof Error
              ? searchError.message
              : String(searchError);
          setResults([]);
          setError(message);
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enabled, query, workspaceDir]);

  return { results, loading, error };
}
