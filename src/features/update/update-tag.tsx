import { useCallback } from "react";

import { openUrl } from "@tauri-apps/plugin-opener";

import { useGitHubRelease } from "./use-github-release";

export function UpdateTag() {
  const { hasUpdate, tag, url } = useGitHubRelease();

  const handleClick = useCallback(() => {
    if (url) {
      void openUrl(url);
    }
  }, [url]);

  if (!hasUpdate || !url) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`New release: ${tag}`}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-amber-300/50 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
    >
      <span className="size-1.5 rounded-full bg-amber-500" />
      {tag}
    </button>
  );
}
