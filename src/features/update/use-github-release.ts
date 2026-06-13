import { useCallback, useEffect, useState } from "react";

const OWNER = "leyen-me";
const REPO = "coder";
const CACHE_KEY = "coder-github-release-cache";
const SEEN_KEY = "coder-github-release-seen";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type ReleaseInfo = {
  /** GitHub release ID (unique, monotonically increasing). */
  id: number;
  tag: string;
  url: string;
};

type CacheEntry = {
  data: ReleaseInfo;
  cachedAt: number;
};

function readCachedRelease(): ReleaseInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCachedRelease(data: ReleaseInfo): void {
  try {
    const entry: CacheEntry = { data, cachedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

/** The last release ID the user has already seen (clicked). */
function readSeenReleaseId(): number | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeSeenReleaseId(id: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // ignore
  }
}

export function useGitHubRelease() {
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(
    readCachedRelease
  );
  const [loading, setLoading] = useState(false);

  const seenId = readSeenReleaseId();
  // New if we have a release and its ID differs from the last seen one
  const hasUpdate =
    releaseInfo !== null && releaseInfo.id !== seenId;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
        {
          headers: { Accept: "application/vnd.github.v3+json" },
        }
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        id: number;
        tag_name: string;
        html_url: string;
      };
      const info: ReleaseInfo = {
        id: json.id,
        tag: json.tag_name,
        url: json.html_url,
      };
      setReleaseInfo(info);
      writeCachedRelease(info);
    } catch {
      // Network error — silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  /** Mark the current release as seen (user clicked the tag). */
  const markSeen = useCallback(() => {
    if (releaseInfo) {
      writeSeenReleaseId(releaseInfo.id);
      // Trigger re-render so hasUpdate becomes false immediately
      setReleaseInfo({ ...releaseInfo });
    }
  }, [releaseInfo]);

  useEffect(() => {
    if (!releaseInfo && !loading) {
      void refresh();
    }
  }, [refresh, releaseInfo, loading]);

  return {
    hasUpdate,
    tag: releaseInfo?.tag ?? null,
    url: releaseInfo?.url ?? null,
    loading,
    markSeen,
    refresh,
  };
}
