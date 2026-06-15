import { useCallback } from "react";
import { RefreshCw } from "lucide-react";

import { useLabSettings } from "./use-lab-settings";
import { useDeepSeekBalance } from "./use-deepseek-balance";

export function ProviderUsageTag() {
  const { settings } = useLabSettings();
  const { condition, refresh } = useDeepSeekBalance();

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (!settings.providerUsageEnabled) {
    return null;
  }

  // State: initial loading
  if (condition.type === "loading") {
    return (
      <button
        type="button"
        disabled
        className="flex shrink-0 cursor-default items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
      >
        <RefreshCw className="size-2.5 animate-spin" />
        ...
      </button>
    );
  }

  // State: active provider is not DeepSeek — not yet supported
  if (condition.type === "no_deepseek") {
    return null;
  }

  // State: API key is env-sourced (not readable from frontend)
  if (condition.type === "env_key") {
    return (
      <button
        type="button"
        onClick={handleRefresh}
        title={`API key set via ${condition.envVar}. Click to retry.`}
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-amber-300/50 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
      >
        <span className="size-1.5 rounded-full bg-amber-500" />
        Env
      </button>
    );
  }

  // State: no API key configured
  if (condition.type === "no_key") {
    return (
      <button
        type="button"
        disabled
        title="No API key configured"
        className="flex shrink-0 cursor-default items-center gap-1 rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60"
      >
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        ---
      </button>
    );
  }

  // State: fetch error
  if (condition.type === "error") {
    return (
      <button
        type="button"
        onClick={handleRefresh}
        title={condition.message}
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-red-300/50 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-700/40 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
      >
        <span className="size-1.5 rounded-full bg-red-500" />
        Err
      </button>
    );
  }

  // State: successful data
  if (condition.data.balanceInfos.length === 0) {
    return null;
  }

  const balance = condition.data.balanceInfos[0];
  const currencySymbol = balance.currency === "CNY" ? "¥" : balance.currency;
  const isAvailable = condition.data.isAvailable;

  return (
    <button
      type="button"
      onClick={handleRefresh}
      title={`${isAvailable ? "Available" : "Insufficient balance"} — ${currencySymbol}${balance.totalBalance}`}
      className={[
        "flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
        isAvailable
          ? "border-green-300/50 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-700/40 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-950/60"
          : "border-red-300/50 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-700/40 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60",
      ].join(" ")}
    >
      <span
        className={[
          "size-1.5 rounded-full",
          isAvailable ? "bg-green-500" : "bg-red-500",
        ].join(" ")}
      />
      {currencySymbol}
      {balance.totalBalance}
    </button>
  );
}
