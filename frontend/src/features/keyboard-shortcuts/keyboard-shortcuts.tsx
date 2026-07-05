import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import {
  SHORTCUT_ACTIONS,
  getShortcutActionDefinition,
} from "@/lib/keyboard-shortcuts/constants";
import {
  isShortcutAllowedInContext,
  shouldDeferToDialog,
} from "@/lib/keyboard-shortcuts/is-shortcut-context";
import { matchKeyboardEvent } from "@/lib/keyboard-shortcuts/match";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts/keyboard-shortcuts-provider";

import { useHotkeyActions } from "./hotkey-actions-context";
import { useSearchDialog } from "./search-dialog-context";
import { useShellChrome } from "./shell-chrome-context";

export function KeyboardShortcuts() {
  const { settings } = useKeyboardShortcuts();
  const { invoke } = useHotkeyActions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { open: openSearch } = useSearchDialog();
  const { toggleSidebar } = useShellChrome();

  const runBuiltinAction = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case "global.search":
          openSearch();
          return true;
        case "global.newChat":
          navigate(paths.chatNew);
          return true;
        case "global.settings":
          navigate(paths.settings);
          return true;
        case "global.skills":
          navigate(paths.skills);
          return true;
        case "global.automations":
          navigate(paths.automations);
          return true;
        case "panel.toggleSidebar":
          toggleSidebar();
          return true;
        default:
          return false;
      }
    },
    [
      navigate,
      openSearch,
      toggleSidebar,
    ]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const contextInput = {
        pathname,
        activeElement: document.activeElement,
      };

      for (const action of SHORTCUT_ACTIONS) {
        const binding = settings[action.id];
        if (!binding || !matchKeyboardEvent(event, binding)) {
          continue;
        }

        const definition = getShortcutActionDefinition(action.id);

        if (!isShortcutAllowedInContext(
          definition.scope,
          definition.allowInInput,
          contextInput
        )) {
          continue;
        }

        if (shouldDeferToDialog(definition.scope)) {
          continue;
        }

        event.preventDefault();
        event.stopPropagation();

        if (runBuiltinAction(action.id)) {
          return;
        }

        if (invoke(action.id)) {
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    invoke,
    pathname,
    runBuiltinAction,
    settings,
  ]);

  return null;
}
