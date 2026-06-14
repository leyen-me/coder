import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useRef, useState } from "react";

const OWNER = "leyen-me";
const REPO = "coder";
const CACHE_KEY = "coder-github-release-cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fallback version used outside Tauri (dev / browser).
 * Must be ≤ the oldest possible CI build version so dev mode never suppresses
 * a real update notification.  Using a zero timestamp achieves this.
 */
const FALLBACK_VERSION = "0.0.00000000000000";

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

/**
 * Compare a GitHub release tag against the currently installed app version.
 *
 * The CI workflow publishes releases with tags like `release-20250614-120000`
 * and bumps the app version to `0.0.YYYYMMDDHHMMSS`.  This function extracts
 * the embedded timestamp from both sides and compares them numerically.
 *
 * For backward compatibility with plain semver tags (e.g. `v0.1.0`) it falls
 * back to a standard semver comparison.
 */
function isNewerRelease(releaseTag: string, currentVersion: string): boolean {
  // ── Timestamp-based comparison (current CI format) ──
  const tagMatch = releaseTag.match(/^release-(\d{8})-(\d{6})$/);
  const verMatch = currentVersion.match(/^0\.0\.(\d{14})$/);

  if (tagMatch) {
    const releaseTs = tagMatch[1] + tagMatch[2]; // e.g. "20250614120000"
    if (verMatch) {
      return releaseTs > verMatch[1];
    }
    // Running an older build that wasn't timestamp-versioned → new release exists
    return true;
  }

  // ── Legacy plain-semver fallback ──
  const a = releaseTag.replace(/^v/i, "").split(".").map(Number);
  const b = currentVersion.replace(/^v/i, "").split(".").map(Number);

  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const an = a[i] ?? 0;
    const bn = b[i] ?? 0;
    if (an > bn) return true;
    if (an < bn) return false;
  }
  return false; // equal
}

/**
 * Load the current app version.
 * In Tauri runtime this reads the real version from the app metadata;
 * outside Tauri it falls back to the package.json version.
 */
let cachedCurrentVersion: string | null = null;

async function loadCurrentVersion(): Promise<string> {
  if (cachedCurrentVersion) return cachedCurrentVersion;

  try {
    cachedCurrentVersion = await getVersion();
  } catch {
    // Not running in Tauri — use fallback
    cachedCurrentVersion = FALLBACK_VERSION;
  }
  return cachedCurrentVersion;
}

export function useGitHubRelease() {
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(
    readCachedRelease
  );
  const [loading, setLoading] = useState(false);
  const currentVersionRef = useRef<string | null>(null);

  // Bootstrap the current version once
  useEffect(() => {
    void loadCurrentVersion().then((v) => {
      currentVersionRef.current = v;
    });
  }, []);

  // Show the tag only when the release is genuinely newer than the installed app
  const hasUpdate =
    releaseInfo !== null &&
    currentVersionRef.current !== null &&
    isNewerRelease(releaseInfo.tag, currentVersionRef.current);

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
    refresh,
  };
}
