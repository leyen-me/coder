import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CUSTOM_PROVIDER_ID_PREFIX,
  createDefaultCustomProviderSettings,
  isPresetProvider,
  PRESET_PROVIDER_LABELS,
} from "./constants";
import {
  mergeAllModels,
  resolveProviderConfig,
  resolveProviderForModel,
  resolveProviderForValue,
  type ModelProviderEntry,
} from "./resolve-provider-config";
import {
  readModelProviderSettings,
  writeModelProviderSettings,
} from "./storage";
import { randomUUID } from "@/lib/random-id";
import type {
  AnyProviderId,
  CustomProviderSettings,
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
  /** All enabled provider IDs (presets and custom). */
  enabledProviders: AnyProviderId[];
  /** Flat list of all models from all enabled providers (may contain duplicate ids). */
  allModels: ModelDefinition[];
  /** Provider-tagged model entries; each has a unique composite `value`. */
  modelEntries: ModelProviderEntry[];
  /** Resolve config for a specific model id across all enabled providers. */
  resolveProviderForModel: (modelId: string) => ResolvedProviderConfig | null;
  /** Resolve config for a stored model value (composite or legacy). */
  resolveProviderForValue: (value: string) => ResolvedProviderConfig | null;
  /** Update settings for a built-in provider. */
  updateProviderSettings: (providerId: ProviderId, patch: Partial<ProviderSettings>) => void;
  /** Update settings for a custom provider. */
  updateCustomProvider: (id: string, patch: Partial<CustomProviderSettings>) => void;
  /** Add a new custom provider; returns its generated id. */
  addCustomProvider: () => string;
  /** Remove a custom provider (and disable it). */
  removeCustomProvider: (id: string) => void;
  /** Toggle provider enabled/disabled (preset or custom). */
  setProviderEnabled: (providerId: string, enabled: boolean) => void;
  /** Human-readable label for a provider id (preset name or custom name). */
  getProviderLabel: (providerId: string) => string;
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

  const updateCustomProvider = useCallback(
    (id: string, patch: Partial<CustomProviderSettings>) => {
      setSettingsState((current) => {
        const existing = current.customProviders[id];
        if (!existing) {
          return current;
        }
        const next = {
          ...current,
          customProviders: {
            ...current.customProviders,
            [id]: { ...existing, ...patch, id },
          },
        };
        writeModelProviderSettings(next);
        return next;
      });
    },
    []
  );

  const addCustomProvider = useCallback((): string => {
    const id = `${CUSTOM_PROVIDER_ID_PREFIX}${randomUUID()}`;
    setSettingsState((current) => {
      const next: ModelProviderSettings = {
        ...current,
        customProviders: {
          ...current.customProviders,
          [id]: createDefaultCustomProviderSettings(id),
        },
        enabledProviders: [...current.enabledProviders, id],
      };
      writeModelProviderSettings(next);
      return next;
    });
    return id;
  }, []);

  const removeCustomProvider = useCallback((id: string) => {
    setSettingsState((current) => {
      const nextCustomProviders = { ...current.customProviders };
      delete nextCustomProviders[id];
      const next: ModelProviderSettings = {
        ...current,
        customProviders: nextCustomProviders,
        enabledProviders: current.enabledProviders.filter((p) => p !== id),
      };
      writeModelProviderSettings(next);
      return next;
    });
  }, []);

  const setProviderEnabled = useCallback(
    (providerId: string, enabled: boolean) => {
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

  const getProviderLabel = useCallback((providerId: string): string => {
    if (isPresetProvider(providerId)) {
      return PRESET_PROVIDER_LABELS[providerId];
    }
    if (providerId === "custom") {
      // Legacy sentinel for unknown models; keep a stable label.
      return "Custom";
    }
    return settings.customProviders[providerId]?.name?.trim() || providerId;
  }, [settings.customProviders]);

  /** Resolved config for the first enabled provider (backward compat for existing code). */
  const resolved = useMemo(() => {
    const firstEnabled = settings.enabledProviders[0] ?? "deepseek";
    return resolveProviderConfig(settings, firstEnabled);
  }, [settings]);

  const enabledProviders = settings.enabledProviders;

  const { models: allModels, entries: modelEntries } = useMemo(
    () => mergeAllModels(settings),
    [settings]
  );

  const resolveForModel = useCallback(
    (modelId: string) => resolveProviderForModel(settings, modelId),
    [settings]
  );

  const resolveForValue = useCallback(
    (value: string) => resolveProviderForValue(settings, value),
    [settings]
  );

  const value = useMemo(
    () => ({
      settings,
      resolved,
      enabledProviders,
      allModels,
      modelEntries,
      resolveProviderForModel: resolveForModel,
      resolveProviderForValue: resolveForValue,
      updateProviderSettings,
      updateCustomProvider,
      addCustomProvider,
      removeCustomProvider,
      setProviderEnabled,
      getProviderLabel,
      setSettings,
    }),
    [
      settings,
      resolved,
      enabledProviders,
      allModels,
      modelEntries,
      resolveForModel,
      resolveForValue,
      updateProviderSettings,
      updateCustomProvider,
      addCustomProvider,
      removeCustomProvider,
      setProviderEnabled,
      getProviderLabel,
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
