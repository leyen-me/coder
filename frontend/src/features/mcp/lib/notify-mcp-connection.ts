import { toast } from "sonner";

import type { McpTestConnectionResult } from "@/features/mcp/api";

type McpToastTranslator = (
  key:
    | "settings.mcpServers.toast.testSuccess"
    | "settings.mcpServers.toast.authRequired"
    | "settings.mcpServers.toast.authorizeAction"
    | "settings.mcpServers.toast.testFailed"
    | "settings.mcpServers.toast.oauthStarted"
    | "settings.mcpServers.toast.oauthFailed",
  params?: Record<string, string | number>
) => string;

export function isMcpAuthRequiredMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("authentication required") ||
    normalized.includes("authorize this server") ||
    normalized.includes("401")
  );
}

export function notifyMcpTestResult(input: {
  serverName: string;
  result: McpTestConnectionResult;
  onAuthorize?: () => void;
  t: McpToastTranslator;
}): void {
  const { serverName, result, onAuthorize, t } = input;

  if (result.ok) {
    toast.success(
      t("settings.mcpServers.toast.testSuccess", {
        name: serverName,
        count: result.toolCount,
      })
    );
    return;
  }

  const authRequired =
    result.authRequired === true || isMcpAuthRequiredMessage(result.message);

  if (authRequired) {
    toast.error(t("settings.mcpServers.toast.authRequired", { name: serverName }), {
      action: onAuthorize
        ? {
            label: t("settings.mcpServers.toast.authorizeAction"),
            onClick: onAuthorize,
          }
        : undefined,
    });
    return;
  }

  toast.error(t("settings.mcpServers.toast.testFailed", { name: serverName }), {
    description: result.message.trim() || undefined,
  });
}

export function notifyMcpOAuthStarted(
  serverName: string,
  t: McpToastTranslator
): void {
  toast.info(t("settings.mcpServers.toast.oauthStarted", { name: serverName }));
}

export function notifyMcpOAuthFailed(input: {
  serverName: string;
  message?: string;
  t: McpToastTranslator;
}): void {
  toast.error(
    input.t("settings.mcpServers.toast.oauthFailed", { name: input.serverName }),
    {
      description: input.message?.trim() || undefined,
    }
  );
}
