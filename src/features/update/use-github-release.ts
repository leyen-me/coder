import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useRef, useState } from "react";

const OWNER = "leyen-me";
const REPO = "coder";
const CACHE_KEY = "coder-github-release-cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`;

/** Fallback version used outside Tauri (dev / browser). */
const FALLBACK_VERSION = "0.0.0";

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
 * Current CI publishes tags like `v0.0.<run_number>` and sets the app version
 * to `0.0.<run_number>`.  Older releases used `release-YYYYMMDD-HHMMSS` tags
 * with timestamp-based versions like `2025.614.1200`.
 *
 * This function handles both formats and the cross-format transition so that
 * users on an old timestamp build still see new semver-format releases.
 */
function isNewerRelease(releaseTag: string, currentVersion: string): boolean {
  // ── Timestamp-based release tag (historical) ──
  //   tag:  release-20250614-120000
  //   ver:  2025.614.1200
  const tagMatch = releaseTag.match(
    /^release-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/
  );

  if (tagMatch) {
    const [, year, month, day, hour, minute] = tagMatch;
    const tagMajor = Number(year);
    const tagMinor = Number(month + day);
    const tagPatch = Number(hour + minute);

    const parts = currentVersion.replace(/^v/i, "").split(".").map(Number);
    const curMajor = parts[0] ?? 0;

    // Cross-format: app is new semver (≤255 major) but release is old timestamp
    // → can't compare, the on-disk version supersedes the cached old release
    if (curMajor <= 255) return false;

    // Same format: direct comparison
    const curMinor = parts[1] ?? 0;
    const curPatch = parts[2] ?? 0;
    if (tagMajor !== curMajor) return tagMajor > curMajor;
    if (tagMinor !== curMinor) return tagMinor > curMinor;
    return tagPatch > curPatch;
  }

  // ── Semver tag (e.g. v0.0.N) ──
  const a = releaseTag.replace(/^v/i, "").split(".").map(Number);
  const b = currentVersion.replace(/^v/i, "").split(".").map(Number);

  // Cross-format: app is old timestamp build (major > 255) but release is semver
  // → the release is always newer
  if ((b[0] ?? 0) > 255) return true;

  // Standard semver comparison
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
 * outside Tauri it falls back to the fallback version.
 * In dev mode, always returns the fallback version so that the real
 * published release (e.g. v0.0.58) is detected as newer.
 */
let cachedCurrentVersion: string | null = null;

async function loadCurrentVersion(): Promise<string> {
  if (cachedCurrentVersion) return cachedCurrentVersion;

  // In dev mode, use fallback so update detection works against real releases
  if (import.meta.env.DEV) {
    cachedCurrentVersion = FALLBACK_VERSION;
    return cachedCurrentVersion;
  }

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
  const fetchedRef = useRef(false);

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
        url: RELEASES_URL,
      };
      setReleaseInfo(info);
      writeCachedRelease(info);
    } catch {
      // Network error — silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount when there is no cached release, but only once
  useEffect(() => {
    if (!releaseInfo && !loading && !fetchedRef.current) {
      fetchedRef.current = true;
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
