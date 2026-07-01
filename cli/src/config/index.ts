/**
 * Coder CLI Configuration System
 *
 * Stores provider settings, API keys, model preferences, and CLI options
 * in a platform-appropriate config directory (e.g. ~/.config/coder/ on Linux).
 */

import { homedir, platform, EOL } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Config directory resolution
// ---------------------------------------------------------------------------

function getConfigDir(): string {
  const home = homedir();
  const p = platform();

  if (p === "win32") {
    // Windows: %APPDATA%/Coder or fallback to %USERPROFILE%/.config/coder
    return process.env.APPDATA
      ? join(process.env.APPDATA, "Coder", "cli")
      : join(home, ".config", "coder", "cli");
  }

  // macOS / Linux: $XDG_CONFIG_HOME/coder or ~/.config/coder
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, "coder", "cli");
  }

  return join(home, ".config", "coder", "cli");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApiKeySource = "manual" | "env";

export type ProviderSettings = {
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  customBaseUrl: string;
  showUsage: boolean;
};

export type ProviderId =
  | "deepseek"
  | "glm"
  | "agnes"
  | "nvidia"
  | "minimax"
  | "custom";

export type ModelDefinition = {
  id: string;
  label?: string;
  contextWindow: number;
  supportsThinking: boolean;
  supportsMultimodal: boolean;
};

export type ResolvedProviderConfig = {
  provider: ProviderId;
  baseUrl: string;
  apiKeySource: ApiKeySource;
  apiKey: string;
  apiKeyEnvVar: string;
  models: ModelDefinition[];
};

export type CoderCliConfig = {
  /** Active provider ID */
  activeProvider: ProviderId;
  /** Provider-specific settings */
  providers: Record<ProviderId, ProviderSettings>;
  /** Last used model ID */
  lastModel: string;
  /** Whether to show token usage after each response */
  showUsage: boolean;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const PRESET_PROVIDERS: Record<Exclude<ProviderId, "custom">, { baseUrl: string; defaultApiKeyEnvVar: string }> = {
  deepseek: { baseUrl: "https://api.deepseek.com", defaultApiKeyEnvVar: "DEEPSEEK_API_KEY" },
  glm: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultApiKeyEnvVar: "GLM_API_KEY" },
  agnes: { baseUrl: "https://api.agnesai.com", defaultApiKeyEnvVar: "AGNES_API_KEY" },
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", defaultApiKeyEnvVar: "NVIDIA_API_KEY" },
  minimax: { baseUrl: "https://api.minimax.chat/v1", defaultApiKeyEnvVar: "MINIMAX_API_KEY" },
};

const PRESET_MODELS: Record<Exclude<ProviderId, "custom">, ModelDefinition[]> = {
  deepseek: [
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", contextWindow: 1_000_000, supportsThinking: true, supportsMultimodal: false },
    { id: "deepseek-chat", label: "DeepSeek Chat", contextWindow: 1_000_000, supportsThinking: false, supportsMultimodal: true },
  ],
  glm: [
    { id: "glm-4", label: "GLM-4", contextWindow: 128_000, supportsThinking: false, supportsMultimodal: true },
    { id: "glm-4-plus", label: "GLM-4 Plus", contextWindow: 128_000, supportsThinking: true, supportsMultimodal: true },
  ],
  agnes: [
    { id: "agnes-v3", label: "Agnes V3", contextWindow: 128_000, supportsThinking: false, supportsMultimodal: true },
  ],
  nvidia: [],
  minimax: [
    { id: "minimax-m1", label: "MiniMax M1", contextWindow: 200_000, supportsThinking: true, supportsMultimodal: false },
  ],
};

function createDefaultProviderSettings(provider: ProviderId): ProviderSettings {
  const isCustom = provider === "custom";
  return {
    apiKeySource: "env",
    apiKey: "",
    apiKeyEnvVar: isCustom ? "CUSTOM_API_KEY" : PRESET_PROVIDERS[provider]?.defaultApiKeyEnvVar ?? "API_KEY",
    customBaseUrl: isCustom ? "https://api.example.com/v1" : "",
    showUsage: false,
  };
}

const PROVIDER_IDS: ProviderId[] = ["deepseek", "glm", "agnes", "nvidia", "minimax", "custom"];

function createDefaultConfig(): CoderCliConfig {
  const providers = {} as Record<ProviderId, ProviderSettings>;
  for (const id of PROVIDER_IDS) {
    providers[id] = createDefaultProviderSettings(id);
  }
  return {
    activeProvider: "deepseek",
    providers,
    lastModel: "deepseek-v4-flash",
    showUsage: false,
  };
}

// ---------------------------------------------------------------------------
// Config file I/O
// ---------------------------------------------------------------------------

const CONFIG_FILE = "config.json";

function getConfigFilePath(): string {
  return join(getConfigDir(), CONFIG_FILE);
}

function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): CoderCliConfig {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    const defaults = createDefaultConfig();
    saveConfig(defaults);
    return defaults;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch {
    const defaults = createDefaultConfig();
    saveConfig(defaults);
    return defaults;
  }
}

function mergeWithDefaults(raw: Record<string, unknown>): CoderCliConfig {
  const defaults = createDefaultConfig();
  return {
    activeProvider: (PROVIDER_IDS as readonly string[]).includes(String(raw.activeProvider ?? ""))
      ? (raw.activeProvider as ProviderId)
      : defaults.activeProvider,
    providers: mergeProviders(raw.providers as Record<string, unknown> | undefined, defaults.providers),
    lastModel: typeof raw.lastModel === "string" ? raw.lastModel : defaults.lastModel,
    showUsage: typeof raw.showUsage === "boolean" ? raw.showUsage : defaults.showUsage,
  };
}

function mergeProviders(
  raw: Record<string, unknown> | undefined,
  defaults: Record<ProviderId, ProviderSettings>,
): Record<ProviderId, ProviderSettings> {
  const result = { ...defaults };
  if (!raw || typeof raw !== "object") {
    return result;
  }

  for (const id of PROVIDER_IDS) {
    const p = (raw as Record<string, Record<string, unknown>>)[id];
    if (p && typeof p === "object") {
      result[id] = {
        apiKeySource: p.apiKeySource === "manual" ? "manual" : "env",
        apiKey: typeof p.apiKey === "string" ? p.apiKey : result[id].apiKey,
        apiKeyEnvVar: typeof p.apiKeyEnvVar === "string" ? p.apiKeyEnvVar : result[id].apiKeyEnvVar,
        customBaseUrl: typeof p.customBaseUrl === "string" ? p.customBaseUrl : result[id].customBaseUrl,
        showUsage: typeof p.showUsage === "boolean" ? p.showUsage : result[id].showUsage,
      };
    }
  }

  return result;
}

export function saveConfig(config: CoderCliConfig): void {
  ensureConfigDir();
  const configPath = getConfigFilePath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Provider config resolution
// ---------------------------------------------------------------------------

export function resolveProviderConfig(config: CoderCliConfig, providerId?: ProviderId): ResolvedProviderConfig {
  const provider = providerId ?? config.activeProvider;
  const settings = config.providers[provider];

  if (provider === "custom") {
    if (!settings.customBaseUrl.trim()) {
      throw new Error(
        "Custom provider selected but no base URL configured. " +
        "Run `coder config` or manually edit the config file."
      );
    }
    return {
      provider,
      baseUrl: settings.customBaseUrl.trim(),
      apiKeySource: settings.apiKeySource,
      apiKey: settings.apiKey,
      apiKeyEnvVar: settings.apiKeyEnvVar.trim(),
      models: [],
    };
  }

  const preset = PRESET_PROVIDERS[provider];
  if (!preset) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return {
    provider,
    baseUrl: settings.customBaseUrl.trim() || preset.baseUrl,
    apiKeySource: settings.apiKeySource,
    apiKey: settings.apiKey,
    apiKeyEnvVar: settings.apiKeyEnvVar.trim() || preset.defaultApiKeyEnvVar,
    models: settings.customBaseUrl.trim()
      ? []
      : PRESET_MODELS[provider] ?? [],
  };
}

export function resolveApiKey(resolved: ResolvedProviderConfig): string {
  if (resolved.apiKeySource === "manual") {
    if (!resolved.apiKey.trim()) {
      throw new Error(
        `API key for ${resolved.provider} is not configured. ` +
        "Set it with: coder config providers.<provider>.apiKey <key>"
      );
    }
    return resolved.apiKey.trim();
  }

  // Read from environment variable
  const envVar = resolved.apiKeyEnvVar;
  const envValue = process.env[envVar]?.trim();
  if (!envValue) {
    throw new Error(
      `Environment variable ${envVar} is not set. ` +
      `Set it with: export ${envVar}=<your-api-key>`
    );
  }
  return envValue;
}

// ---------------------------------------------------------------------------
// Config directory path (exported for diagnostics)
// ---------------------------------------------------------------------------

export function getConfigDirPath(): string {
  return getConfigDir();
}

export function getConfigFilePathExplicit(): string {
  return getConfigFilePath();
}
