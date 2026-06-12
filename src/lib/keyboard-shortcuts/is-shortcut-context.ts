import { isChatRoute } from "@/app/paths";

import type { ShortcutScope } from "./types";

function isEditableElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  if (element.closest("[data-composer-input]")) {
    return true;
  }

  if (element.closest(".monaco-editor")) {
    return true;
  }

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    return type !== "checkbox" && type !== "radio" && type !== "range";
  }

  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true;
  }

  const htmlElement = element as HTMLElement;
  return htmlElement.isContentEditable;
}

function isDialogOpen(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"][data-state="open"]')
  );
}

export type ShortcutContextInput = {
  pathname: string;
  activeElement: Element | null;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
};

export function isShortcutAllowedInContext(
  scope: ShortcutScope,
  allowInInput: boolean | undefined,
  input: ShortcutContextInput
): boolean {
  const inEditable = isEditableElement(input.activeElement);
  const onChatRoute = isChatRoute(input.pathname);

  if (inEditable && !allowInInput) {
    return false;
  }

  switch (scope) {
    case "global":
      return true;
    case "chat":
      return onChatRoute;
    case "composer":
      return onChatRoute && Boolean(input.activeElement?.closest("[data-composer-input]"));
    case "file":
      return onChatRoute && input.rightPanelOpen;
    case "terminal":
      return onChatRoute && input.bottomPanelOpen;
    default:
      return false;
  }
}

export function shouldDeferToDialog(scope: ShortcutScope): boolean {
  return scope !== "global" && isDialogOpen();
}
