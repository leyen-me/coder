/**
 * coder init — Interactive initialization of Coder CLI configuration.
 */

import { bold, dim, info, success, error, writeLine, writeError } from "../ui";
import { loadConfig, saveConfig, getConfigDirPath, getConfigFilePathExplicit } from "../config";
import { createInterface } from "node:readline";

export async function initCommand(): Promise<void> {
  writeLine(bold("\nCoder CLI — Initialization"));
  writeLine(dim("───────────────────────────────────────"));
  writeLine(`Config directory: ${getConfigDirPath()}`);
  writeLine("");

  const config = loadConfig();

  // Provider selection
  writeLine(info("Select your AI provider:"));
  const providers = ["deepseek", "glm", "agnes", "nvidia", "minimax", "custom"];
  for (let i = 0; i < providers.length; i++) {
    writeLine(`  ${i + 1}. ${providers[i]}`);
  }
  writeLine("");

  const providerIndex = await askQuestion("Provider number [1]: ");
  const providerChoice = parseInt(providerIndex || "1", 10);
  const selectedProvider = providers[Math.max(0, Math.min(providerChoice - 1, providers.length - 1))];
  config.activeProvider = selectedProvider as any;
  writeLine(`  Selected: ${bold(selectedProvider)}`);
  writeLine("");

  // API key
  const providerSettings = config.providers[selectedProvider as keyof typeof config.providers];
  const envVar = providerSettings.apiKeyEnvVar;

  writeLine(info(`API Key Configuration for "${selectedProvider}":`));
  writeLine(`  You can set the ${bold(envVar)} environment variable,`);
  writeLine(`  or enter the key directly (stored in config file).`);
  writeLine("");

  const source = await askQuestion("Use environment variable? [Y/n]: ");
  const useEnv = source.toLowerCase() !== "n";

  if (useEnv) {
    providerSettings.apiKeySource = "env";
    writeLine(`  Using ${bold(envVar)} environment variable.`);
    writeLine(`  Make sure to set it: export ${envVar}=<your-api-key>`);
  } else {
    providerSettings.apiKeySource = "manual";
    const key = await askQuestion("Enter API key: ");
    if (key.trim()) {
      providerSettings.apiKey = key.trim();
      writeLine("  API key saved to config.");
    } else {
      writeLine(`  ${error("No key entered. Set it later with: coder config")}`);
    }
  }
  writeLine("");

  // Custom base URL (optional)
  if (selectedProvider === "custom") {
    const baseUrl = await askQuestion("Custom API base URL: ");
    if (baseUrl.trim()) {
      providerSettings.customBaseUrl = baseUrl.trim();
    }
  } else {
    const customUrl = await askQuestion(`Custom base URL (leave empty for default): `);
    if (customUrl.trim()) {
      providerSettings.customBaseUrl = customUrl.trim();
    }
    writeLine("");
  }

  // Save config
  saveConfig(config);
  writeLine(success("\n✓ Configuration saved!"));
  writeLine(`  Config file: ${getConfigFilePathExplicit()}`);
  writeLine("");
  writeLine(info("Quick start:"));
  writeLine("  coder \"What is in this directory?\"");
  writeLine("  coder ask \"Explain this code\"");
  writeLine("  coder repl");
  writeLine("");
}

function askQuestion(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
