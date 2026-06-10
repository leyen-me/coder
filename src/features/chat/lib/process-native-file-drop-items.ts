import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

import { parseReadFileToolError } from "@/features/agent/tools/parse-read-file-tool-error";
import { normalizeExternalPathForWorkspace } from "@/features/right-panel/lib/workspace-file-ops";
import {
  isImageFile,
  isImagePath,
  type NativeFileDropItem,
} from "@/lib/dnd/external-file-drop";

import { insertFileMentionIntoComposer } from "./composer-insert-store";

type ProcessNativeFileDropMessages = {
  attachmentErrorMultimodalUnsupported: string;
  externalDropInvalidPath: string;
  externalDropOutsideWorkspace: string;
  externalDropPathUnresolved: string;
  externalDropUnsupportedRuntime: string;
  externalDropWorkspaceRequired: string;
};

type ProcessNativeFileDropItemsOptions = {
  items: NativeFileDropItem[];
  workspaceDir?: string | null;
  supportsMultimodal: boolean;
  addAttachments: (files: File[] | FileList) => void;
  onError: (message: string) => void;
  messages: ProcessNativeFileDropMessages;
};

async function fileFromAbsolutePath(path: string): Promise<File | null> {
  try {
    const response = await fetch(convertFileSrc(path));
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const name = path.split(/[/\\]/).pop() ?? "file";
    return new File([blob], name, {
      type: blob.type || "application/octet-stream",
    });
  } catch {
    return null;
  }
}

export async function processNativeFileDropItems({
  items,
  workspaceDir,
  supportsMultimodal,
  addAttachments,
  onError,
  messages,
}: ProcessNativeFileDropItemsOptions): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const trimmedWorkspaceDir = workspaceDir?.trim() ?? "";

  for (const item of items) {
    const path = item.path;
    const treatsAsImage =
      (item.file && isImageFile(item.file)) ||
      (path ? isImagePath(path) : false);

    if (treatsAsImage) {
      if (!supportsMultimodal) {
        onError(messages.attachmentErrorMultimodalUnsupported);
        continue;
      }

      const file =
        item.file ?? (path && isTauri() ? await fileFromAbsolutePath(path) : null);

      if (file) {
        addAttachments([file]);
      }
      continue;
    }

    if (!path) {
      onError(messages.externalDropPathUnresolved);
      continue;
    }

    if (!trimmedWorkspaceDir) {
      onError(messages.externalDropWorkspaceRequired);
      continue;
    }

    if (!isTauri()) {
      onError(messages.externalDropUnsupportedRuntime);
      continue;
    }

    try {
      const normalized = await normalizeExternalPathForWorkspace(
        trimmedWorkspaceDir,
        path
      );
      insertFileMentionIntoComposer(normalized.path, {
        isDir: normalized.isDir,
        name: normalized.name,
      });
    } catch (error) {
      const structured = parseReadFileToolError(error);
      if (structured?.code === "outside_workspace") {
        onError(messages.externalDropOutsideWorkspace);
        continue;
      }

      onError(messages.externalDropInvalidPath);
    }
  }
}

export function pathsToNativeFileDropItems(
  paths: readonly string[]
): NativeFileDropItem[] {
  return paths.map((path) => ({ path }));
}
