import { useSyncExternalStore } from "react";

export type ComposerInsertPayload = {
  path: string;
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
  options?: { focus?: boolean }
): void {
  latestInsert = { path, focus: options?.focus ?? true };
  version += 1;
  emit();
}

export function getLatestComposerInsert(): ComposerInsertPayload | null {
  return latestInsert;
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

export function appendFileMention(current: string, path: string): string {
  const mention = `@${path}`;

  if (current.split(/\s+/).includes(mention)) {
    return current;
  }

  if (!current.trim()) {
    return `${mention} `;
  }

  const separator = current.endsWith(" ") ? "" : " ";
  return `${current}${separator}${mention} `;
}

export const COMPOSER_TEXTAREA_SELECTOR = 'textarea[name="message"]';

export function focusComposerTextarea(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    COMPOSER_TEXTAREA_SELECTOR
  );
  if (!textarea) {
    return;
  }

  textarea.focus();
  const end = textarea.value.length;
  textarea.setSelectionRange(end, end);
}
