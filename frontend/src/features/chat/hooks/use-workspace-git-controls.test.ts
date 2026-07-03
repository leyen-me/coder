import { describe, expect, it } from "vitest";

/** Mirrors the hook guard: only apply fetch results for the active workspace path. */
export function shouldApplyGitFetchResult(
  requestDir: string,
  currentDir: string | null | undefined
): boolean {
  return currentDir?.trim() === requestDir;
}

describe("shouldApplyGitFetchResult", () => {
  it("accepts matching workspace paths", () => {
    expect(shouldApplyGitFetchResult("/repo", "/repo")).toBe(true);
    expect(shouldApplyGitFetchResult("/repo", "  /repo  ")).toBe(true);
  });

  it("rejects stale responses after the workspace changed", () => {
    expect(shouldApplyGitFetchResult("/git-repo", "/other")).toBe(false);
    expect(shouldApplyGitFetchResult("/git-repo", null)).toBe(false);
  });
});
