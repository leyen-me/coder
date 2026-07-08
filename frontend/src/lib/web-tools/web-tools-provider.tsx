import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getWebSearchConfigError,
  resolveWebSearchConfig,
} from "./resolve-web-search-config";
import { readWebToolsSettings, writeWebToolsSettings } from "./storage";
import type { WebSearchConfig, WebToolsSettings } from "./types";

type WebToolsContextValue = {
  settings: WebToolsSettings;
  webSearchConfig: WebSearchConfig | null;
  webSearchConfigError: string;
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

  const webSearchConfig = useMemo(
    () => resolveWebSearchConfig(settings),
    [settings]
  );

  const webSearchConfigError = useMemo(
    () => getWebSearchConfigError(settings),
    [settings]
  );

  const value = useMemo(
    () => ({
      settings,
      webSearchConfig,
      webSearchConfigError,
      updateSettings,
      setSettings,
    }),
    [settings, webSearchConfig, webSearchConfigError, updateSettings, setSettings]
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
