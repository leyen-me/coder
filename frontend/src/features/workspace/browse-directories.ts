import { apiPost } from "@/lib/api/client";

export type BrowseDirectoryEntry = {
  name: string;
  path: string;
};

export type BrowseDirectoriesResult = {
  path: string;
  parent: string | null;
  entries: BrowseDirectoryEntry[];
};

export async function browseDirectories(
  path?: string | null
): Promise<BrowseDirectoriesResult> {
  return apiPost<BrowseDirectoriesResult>("/api/browse_directories", {
    path: path?.trim() || undefined,
  });
}
