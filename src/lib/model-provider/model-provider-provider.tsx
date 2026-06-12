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
import type {
  ModelProviderSettings,
  ProviderId,
  ProviderSettings,
  ResolvedProviderConfig,
} from "./types";

type ModelProviderContextValue = {
  settings: ModelProviderSettings;
  activeProvider: ProviderId;
  activeProviderSettings: ProviderSettings;
  resolved: ResolvedProviderConfig;
  setActiveProvider: (provider: ProviderId) => void;
  updateActiveProviderSettings: (patch: Partial<ProviderSettings>) => void;
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

  const setActiveProvider = useCallback((provider: ProviderId) => {
    setSettingsState((current) => {
      const next = { ...current, activeProvider: provider };
      writeModelProviderSettings(next);
      return next;
    });
  }, []);

  const updateActiveProviderSettings = useCallback(
    (patch: Partial<ProviderSettings>) => {
      setSettingsState((current) => {
        const next = {
          ...current,
          providers: {
            ...current.providers,
            [current.activeProvider]: {
              ...current.providers[current.activeProvider],
              ...patch,
            },
          },
        };
        writeModelProviderSettings(next);
        return next;
      });
    },
    []
  );

  const activeProvider = settings.activeProvider;
  const activeProviderSettings = settings.providers[activeProvider];

  const resolved = useMemo(
    () => resolveProviderConfig(settings),
    [settings]
  );

  const value = useMemo(
    () => ({
      settings,
      activeProvider,
      activeProviderSettings,
      resolved,
      setActiveProvider,
      updateActiveProviderSettings,
      setSettings,
    }),
    [
      settings,
      activeProvider,
      activeProviderSettings,
      resolved,
      setActiveProvider,
      updateActiveProviderSettings,
      setSettings,
    ]
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
