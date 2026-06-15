import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { PRESET_PROVIDERS } from "@/lib/model-provider/constants";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { fetchDeepSeekBalance, type DeepSeekBalanceResponse } from "./deepseek-balance";

type BalanceCondition =
  | { type: "loading" }
  | { type: "no_deepseek"; reason: string }
  | { type: "env_key"; envVar: string }
  | { type: "no_key" }
  | { type: "data"; data: DeepSeekBalanceResponse }
  | { type: "error"; message: string };

async function resolveApiKey(
  resolved: ReturnType<typeof useModelProvider>["resolved"]
): Promise<string | null> {
  if (resolved.apiKeySource === "manual") {
    return resolved.apiKey.trim() || null;
  }

  // env-sourced: try reading via Tauri command
  const envVar = resolved.apiKeyEnvVar.trim() || PRESET_PROVIDERS.deepseek.defaultApiKeyEnvVar;
  try {
    const value = await invoke<string | null>("resolve_env_var", {
      args: { name: envVar },
    });
    if (value) {
      return value;
    }
  } catch {
    // Tauri not available or command failed — fall through
  }

  return null;
}

export function useDeepSeekBalance() {
  const { resolved } = useModelProvider();
  const [condition, setCondition] = useState<BalanceCondition>({
    type: "loading",
  });

  const refresh = useCallback(async () => {
    if (resolved.provider !== "deepseek") {
      setCondition({
        type: "no_deepseek",
        reason: `Active provider is ${resolved.provider}, not deepseek`,
      });
      return;
    }

    const apiKey = await resolveApiKey(resolved);

    if (!apiKey) {
      if (resolved.apiKeySource === "env") {
        setCondition({
          type: "env_key",
          envVar: resolved.apiKeyEnvVar.trim() || PRESET_PROVIDERS.deepseek.defaultApiKeyEnvVar,
        });
      } else {
        setCondition({ type: "no_key" });
      }
      return;
    }

    setCondition({ type: "loading" });

    try {
      const data = await fetchDeepSeekBalance(apiKey);
      setCondition({ type: "data", data });
    } catch (err) {
      setCondition({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to fetch balance",
      });
    }
  }, [resolved]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { condition, refresh };
}
