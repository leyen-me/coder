import { isTauri } from "@tauri-apps/api/core";

import { normalizeExternalPathForWorkspace } from "@/features/right-panel/lib/workspace-file-ops";
import {
  isImageFile,
  isImagePath,
  type NativeFileDropItem,
} from "@/lib/dnd/external-file-drop";

import { imageFileFromAbsolutePath } from "./composer-image-attachments";
import { insertFileMentionIntoComposer } from "./composer-insert-store";

type ProcessNativeFileDropMessages = {
  externalDropImageLoadFailed: string;
  externalDropInvalidPath: string;
  externalDropPathUnresolved: string;
  externalDropUnsupportedRuntime: string;
};

type ProcessNativeFileDropItemsOptions = {
  items: NativeFileDropItem[];
  workspaceDir?: string | null;
  addAttachments: (files: File[] | FileList) => void;
  onError: (message: string) => void;
  messages: ProcessNativeFileDropMessages;
};

export async function processNativeFileDropItems({
  items,
  workspaceDir,
  addAttachments,
  onError,
  messages,
}: ProcessNativeFileDropItemsOptions): Promise<void> {
  if (items.length === 0) {
    return;
  }

  for (const item of items) {
    const path = item.path;
    const treatsAsImage =
      (item.file && isImageFile(item.file)) ||
      (path ? isImagePath(path) : false);

    if (treatsAsImage) {
      if (item.file) {
        addAttachments([item.file]);
        continue;
      }

      if (path && isTauri()) {
        const file = await imageFileFromAbsolutePath(path);
        if (file) {
          addAttachments([file]);
        } else {
          onError(messages.externalDropImageLoadFailed);
        }
        continue;
      }

      onError(messages.externalDropPathUnresolved);
      continue;
    }

    if (!path) {
      onError(messages.externalDropPathUnresolved);
      continue;
    }

    if (!isTauri()) {
      onError(messages.externalDropUnsupportedRuntime);
      continue;
    }

    try {
      const normalized = await normalizeExternalPathForWorkspace(
        workspaceDir,
        path
      );
      insertFileMentionIntoComposer(normalized.path, {
        isDir: normalized.isDir,
        name: normalized.name,
      });
    } catch {
      onError(messages.externalDropInvalidPath);
    }
  }
}

export function pathsToNativeFileDropItems(
  paths: readonly string[]
): NativeFileDropItem[] {
  return paths.map((path) => ({ path }));
}
