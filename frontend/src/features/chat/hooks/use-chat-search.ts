import { useEffect, useRef, useState } from "react";

import { searchChats, type ChatSearchResult } from "@/lib/db";

const SEARCH_DEBOUNCE_MS = 200;

type UseChatSearchResult = {
  results: ChatSearchResult[];
  loading: boolean;
  error: string | null;
};

export function useChatSearch(
  query: string,
  enabled: boolean
): UseChatSearchResult {
  const [results, setResults] = useState<ChatSearchResult[]>([]);
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

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    const timeoutId = window.setTimeout(() => {
      void searchChats(query)
        .then((data) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setResults(data);
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
  }, [enabled, query]);

  return { results, loading, error };
}
