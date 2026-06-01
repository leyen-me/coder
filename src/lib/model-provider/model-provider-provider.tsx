import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { resolveProviderConfig } from "./resolve-provider-config";
import {
  readModelProviderSettings,
  writeModelProviderSettings,
} from "./storage";
import type { ModelProviderSettings, ResolvedProviderConfig } from "./types";

type ModelProviderContextValue = {
  settings: ModelProviderSettings;
  resolved: ResolvedProviderConfig;
  updateSettings: (patch: Partial<ModelProviderSettings>) => void;
  setSettings: (settings: ModelProviderSettings) => void;
};

const ModelProviderContext = createContext<ModelProviderContextValue | null>(
  null
);

type ModelProviderProviderProps = {
  children: ReactNode;
};

export function ModelProviderProvider({ children }: ModelProviderProviderProps) {
  const [settings, setSettingsState] = useState<ModelProviderSettings>(
    readModelProviderSettings
  );

  const setSettings = useCallback((nextSettings: ModelProviderSettings) => {
    setSettingsState(nextSettings);
    writeModelProviderSettings(nextSettings);
  }, []);

  const updateSettings = useCallback((patch: Partial<ModelProviderSettings>) => {
    setSettingsState((current) => {
      const next = { ...current, ...patch };
      writeModelProviderSettings(next);
      return next;
    });
  }, []);

  const resolved = useMemo(
    () => resolveProviderConfig(settings),
    [settings]
  );

  const value = useMemo(
    () => ({
      settings,
      resolved,
      updateSettings,
      setSettings,
    }),
    [settings, resolved, updateSettings, setSettings]
  );

  return (
    <ModelProviderContext.Provider value={value}>
      {children}
    </ModelProviderContext.Provider>
  );
}

export function useModelProvider(): ModelProviderContextValue {
  const context = useContext(ModelProviderContext);

  if (!context) {
    throw new Error("useModelProvider must be used within ModelProviderProvider");
  }

  return context;
}
