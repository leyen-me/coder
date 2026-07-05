import {
  isImageFile,
  isImagePath,
  type NativeFileDropItem,
} from "@/lib/dnd/external-file-drop";

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
  workspaceDir: _workspaceDir,
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

      onError(messages.externalDropPathUnresolved);
      continue;
    }

    if (!path) {
      onError(messages.externalDropPathUnresolved);
      continue;
    }

    insertFileMentionIntoComposer(path);
  }
}
