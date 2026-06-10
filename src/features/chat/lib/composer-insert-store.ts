import { useSyncExternalStore } from "react";

export type ComposerInsertPayload = {
  path: string;
  name?: string;
  isDir?: boolean;
  focus: boolean;
};

let version = 0;
let latestInsert: ComposerInsertPayload | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function insertFileMentionIntoComposer(
  path: string,
  options?: { focus?: boolean; name?: string; isDir?: boolean }
): void {
  latestInsert = {
    path,
    focus: options?.focus ?? true,
    isDir: options?.isDir,
    name: options?.name,
  };
  version += 1;
  emit();
}

export function getLatestComposerInsert(): ComposerInsertPayload | null {
  const payload = latestInsert;
  latestInsert = null;
  return payload;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion(): number {
  return version;
}

export function useComposerInsertVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/** @deprecated String append path; rich composer inserts inline nodes instead. */
export function appendFileMention(current: string, path: string): string {
  const mention = `@${path}`;

  if (!current.trim()) {
    return `${mention} `;
  }

  const separator = current.endsWith(" ") ? "" : " ";
  return `${current}${separator}${mention} `;
}

export const COMPOSER_EDITOR_SELECTOR =
  '.ProseMirror[data-composer-input="true"]';

/** @deprecated Use focusComposerEditor. */
export const COMPOSER_TEXTAREA_SELECTOR = COMPOSER_EDITOR_SELECTOR;

export function focusComposerEditor(): void {
  const editor = document.querySelector<HTMLElement>(COMPOSER_EDITOR_SELECTOR);
  if (!editor) {
    return;
  }

  editor.focus();
}

/** @deprecated Use focusComposerEditor. */
export function focusComposerTextarea(): void {
  focusComposerEditor();
}
