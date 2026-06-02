import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";

export async function pickWorkspaceDir(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select workspace folder",
  });

  if (typeof selected !== "string" || !selected.trim()) {
    return null;
  }

  return selected.trim();
}
