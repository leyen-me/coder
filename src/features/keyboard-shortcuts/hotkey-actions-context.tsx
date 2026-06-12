import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import type { ShortcutActionId } from "@/lib/keyboard-shortcuts/types";

export type HotkeyActionHandler = () => void | boolean;

export type RegisteredHotkeyAction = {
  handler: HotkeyActionHandler;
  enabled?: () => boolean;
};

type HotkeyActionsContextValue = {
  register: (
    actionId: ShortcutActionId,
    action: RegisteredHotkeyAction
  ) => () => void;
  invoke: (actionId: ShortcutActionId) => boolean;
};

const HotkeyActionsContext = createContext<HotkeyActionsContextValue | null>(
  null
);

export function HotkeyActionsProvider({ children }: { children: ReactNode }) {
  const actionsRef = useRef(new Map<ShortcutActionId, RegisteredHotkeyAction>());

  const register = useCallback(
    (actionId: ShortcutActionId, action: RegisteredHotkeyAction) => {
      actionsRef.current.set(actionId, action);
      return () => {
        const current = actionsRef.current.get(actionId);
        if (current === action) {
          actionsRef.current.delete(actionId);
        }
      };
    },
    []
  );

  const invoke = useCallback((actionId: ShortcutActionId) => {
    const action = actionsRef.current.get(actionId);
    if (!action) {
      return false;
    }

    if (action.enabled && !action.enabled()) {
      return false;
    }

    const result = action.handler();
    return result !== false;
  }, []);

  const value = useMemo(
    () => ({
      register,
      invoke,
    }),
    [invoke, register]
  );

  return (
    <HotkeyActionsContext.Provider value={value}>
      {children}
    </HotkeyActionsContext.Provider>
  );
}

export function useHotkeyActions(): HotkeyActionsContextValue {
  const context = useContext(HotkeyActionsContext);

  if (!context) {
    throw new Error("useHotkeyActions must be used within HotkeyActionsProvider");
  }

  return context;
}

export function useRegisterHotkeyAction(
  actionId: ShortcutActionId,
  handler: HotkeyActionHandler,
  enabled?: () => boolean
): void {
  const { register } = useHotkeyActions();

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    return register(actionId, {
      handler: () => handlerRef.current(),
      enabled: () => enabledRef.current?.() ?? true,
    });
  }, [actionId, register]);
}
