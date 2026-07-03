import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { resolveProviderConfig, resolveProviderForModel, mergeAllModels } from "./resolve-provider-config";
import {
  readModelProviderSettings,
  writeModelProviderSettings,
} from "./storage";
import type {
  ModelDefinition,
  ModelProviderSettings,
  ProviderId,
  ProviderSettings,
  ResolvedProviderConfig,
} from "./types";

type ModelProviderContextValue = {
  settings: ModelProviderSettings;
  /** Resolved config for the first enabled provider (backward compat). */
  resolved: ResolvedProviderConfig;
  /** All enabled provider IDs. */
  enabledProviders: ProviderId[];
  /** Flat list of all models from all enabled providers. */
  allModels: ModelDefinition[];
  /** Maps model ID → owning provider ID. */
  modelProviders: Map<string, ProviderId>;
  /** Resolve config for a specific model across all enabled providers. */
  resolveProviderForModel: (modelId: string) => ResolvedProviderConfig | null;
  /** Update settings for a specific provider. */
  updateProviderSettings: (providerId: ProviderId, patch: Partial<ProviderSettings>) => void;
  /** Toggle provider enabled/disabled. */
  setProviderEnabled: (providerId: ProviderId, enabled: boolean) => void;
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

  // Re-read settings when storage finishes loading from backend
  useEffect(() => {
    const handleStorageReady = () => {
      const saved = readModelProviderSettings();
      setSettingsState(saved);
    };
    window.addEventListener("coder:storage-ready", handleStorageReady);
    return () => window.removeEventListener("coder:storage-ready", handleStorageReady);
  }, []);

  const setSettings = useCallback((nextSettings: ModelProviderSettings) => {
    setSettingsState(nextSettings);
    writeModelProviderSettings(nextSettings);
  }, []);

  const updateProviderSettings = useCallback(
    (providerId: ProviderId, patch: Partial<ProviderSettings>) => {
      setSettingsState((current) => {
        const next = {
          ...current,
          providers: {
            ...current.providers,
            [providerId]: {
              ...current.providers[providerId],
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

  const setProviderEnabled = useCallback(
    (providerId: ProviderId, enabled: boolean) => {
      setSettingsState((current) => {
        const next = {
          ...current,
          enabledProviders: enabled
            ? [...new Set([...current.enabledProviders, providerId])]
            : current.enabledProviders.filter((id) => id !== providerId),
        };
        writeModelProviderSettings(next);
        return next;
      });
    },
    []
  );

  /** Resolved config for the first enabled provider (backward compat for existing code). */
  const resolved = useMemo(() => {
    const firstEnabled = settings.enabledProviders[0] ?? "deepseek";
    return resolveProviderConfig(settings, firstEnabled);
  }, [settings]);

  const enabledProviders = settings.enabledProviders;

  const { models: allModels, modelProviders } = useMemo(
    () => mergeAllModels(settings),
    [settings]
  );

  const resolveForModel = useCallback(
    (modelId: string) => resolveProviderForModel(settings, modelId),
    [settings]
  );

  const value = useMemo(
    () => ({
      settings,
      resolved,
      enabledProviders,
      allModels,
      modelProviders,
      resolveProviderForModel: resolveForModel,
      updateProviderSettings,
      setProviderEnabled,
      setSettings,
    }),
    [
      settings,
      resolved,
      enabledProviders,
      allModels,
      modelProviders,
      resolveForModel,
      updateProviderSettings,
      setProviderEnabled,
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
