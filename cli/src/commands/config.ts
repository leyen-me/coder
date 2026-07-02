/**
 * coder config — View or edit configuration.
 */

import { bold, dim, info, warning, writeLine } from "../ui";
import {
  loadConfig,
  saveConfig,
  getConfigDirPath,
  getConfigFilePathExplicit,
  resolveTavilyApiKey,
  type ProviderId,
  type ProviderSettings,
} from "../config";

const PROVIDER_IDS: ProviderId[] = ["deepseek", "glm", "agnes", "nvidia", "minimax", "custom"];

export async function configCommand(key?: string, value?: string): Promise<void> {
  const config = loadConfig();

  // If no args, show full config
  if (!key) {
    showConfig(config);
    return;
  }

  // If both key and value, set a value
  if (key && value !== undefined) {
    await setConfigValue(config, key, value);
    return;
  }

  // If only key, show that specific value
  showConfigValue(config, key);
}

function showConfig(config: ReturnType<typeof loadConfig>): void {
  writeLine(bold("\nCoder CLI Configuration"));
  writeLine(dim("───────────────────────────────────────"));
  writeLine(`Config directory: ${getConfigDirPath()}`);
  writeLine(`Config file: ${getConfigFilePathExplicit()}`);
  writeLine("");
  writeLine(bold("Active Settings:"));
  writeLine(`  Active provider: ${config.activeProvider}`);
  writeLine(`  Last model:      ${config.lastModel}`);
  writeLine(`  Show usage:      ${config.showUsage}`);
  const tavilyKey = resolveTavilyApiKey(config);
  writeLine(`  Web search:      ${tavilyKey ? "configured" : "not configured (set via coder config tavilyApiKey <key> or TAVILY_API_KEY env var)"}`);
  writeLine("");

  for (const providerId of PROVIDER_IDS) {
    const p = config.providers[providerId];
    writeLine(bold(`Provider: ${providerId}`));
    writeLine(`  API Key Source: ${p.apiKeySource}`);
    writeLine(`  API Key Env Var: ${p.apiKeyEnvVar}`);
    writeLine(`  API Key (stored): ${p.apiKey ? "***" : "(not set)"}`);
    writeLine(`  Custom Base URL: ${p.customBaseUrl || "(default)"}`);
    writeLine("");
  }

  writeLine(dim("To change a value: coder config <key> <value>"));
  writeLine(dim("Examples:"));
  writeLine(dim('  coder config activeProvider "deepseek"'));
  writeLine(dim('  coder config lastModel "deepseek-v4-flash"'));
  writeLine(dim('  coder config providers.deepseek.apiKeySource "env"'));
  writeLine("");
}

function showConfigValue(config: ReturnType<typeof loadConfig>, key: string): void {
  const value = getNestedValue(config, key);
  if (value === undefined) {
    writeLine(warning(`Config key not found: ${key}`));
    return;
  }
  writeLine(String(value));
}

async function setConfigValue(
  config: ReturnType<typeof loadConfig>,
  key: string,
  value: string,
): Promise<void> {
  setNestedValue(config, key, parseValue(value));
  saveConfig(config);
  writeLine(info(`Config updated: ${key} = ${value}`));
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current)) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

function parseValue(value: string): unknown {
  // Try to parse as boolean
  if (value === "true") return true;
  if (value === "false") return false;
  // Try to parse as number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") return num;
  // Keep as string
  return value;
}
