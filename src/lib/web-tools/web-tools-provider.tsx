import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { resolveTavilyConfig } from "./resolve-tavily-config";
import { readWebToolsSettings, writeWebToolsSettings } from "./storage";
import type { ResolvedTavilyConfig, WebToolsSettings } from "./types";

type WebToolsContextValue = {
  settings: WebToolsSettings;
  tavilyConfig: ResolvedTavilyConfig | null;
  updateSettings: (patch: Partial<WebToolsSettings>) => void;
  setSettings: (settings: WebToolsSettings) => void;
};

const WebToolsContext = createContext<WebToolsContextValue | null>(null);

type WebToolsProviderProps = {
  children: ReactNode;
};

export function WebToolsProvider({ children }: WebToolsProviderProps) {
  const [settings, setSettingsState] = useState<WebToolsSettings>(
    readWebToolsSettings
  );

  const setSettings = useCallback((nextSettings: WebToolsSettings) => {
    setSettingsState(nextSettings);
    writeWebToolsSettings(nextSettings);
  }, []);

  const updateSettings = useCallback((patch: Partial<WebToolsSettings>) => {
    setSettingsState((current) => {
      const next = { ...current, ...patch };
      writeWebToolsSettings(next);
      return next;
    });
  }, []);

  const tavilyConfig = useMemo(
    () => resolveTavilyConfig(settings),
    [settings]
  );

  const value = useMemo(
    () => ({
      settings,
      tavilyConfig,
      updateSettings,
      setSettings,
    }),
    [settings, tavilyConfig, updateSettings, setSettings]
  );

  return (
    <WebToolsContext.Provider value={value}>{children}</WebToolsContext.Provider>
  );
}

export function useWebTools(): WebToolsContextValue {
  const context = useContext(WebToolsContext);

  if (!context) {
    throw new Error("useWebTools must be used within WebToolsProvider");
  }

  return context;
}
