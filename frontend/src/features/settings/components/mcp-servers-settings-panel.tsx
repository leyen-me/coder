import { Plus } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  listMcpServers,
  getMcpServer,
  saveMcpServer,
  deleteMcpServer,
} from "@/lib/db/mcp-servers";
import type { McpServerConfig } from "@/lib/db/types";
import {
  getMcpOAuthStatus,
  revokeMcpOAuth,
  startMcpOAuth,
  testMcpConnection,
} from "@/features/mcp/api";
import {
  formatHeadersLines,
  isRemoteMcpServer,
  normalizeMcpServerConfig,
  parseHeadersLines,
} from "@/features/mcp/lib/server-config";
import {
  isMcpAuthRequiredMessage,
  notifyMcpOAuthFailed,
  notifyMcpOAuthStarted,
  notifyMcpTestResult,
} from "@/features/mcp/lib/notify-mcp-connection";

import { McpServerCard } from "./mcp-server-card";
import { SettingSelect } from "./setting-select";
import {
  formatEnvLines,
  formatMultilineList,
  parseEnvLines,
  parseMultilineList,
} from "../lib/parse-mcp-form";

type McpTransport = McpServerConfig["transport"];

type McpServerFormState = {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  url: string;
  argsText: string;
  envText: string;
  headersText: string;
  enabled: boolean;
};

const TRANSPORT_OPTIONS: McpTransport[] = ["stdio", "http"];

function createDefaultConfig(): McpServerFormState {
  return {
    id: "",
    name: "",
    transport: "stdio",
    command: "",
    url: "",
    argsText: "",
    envText: "",
    headersText: "",
    enabled: true,
  };
}

function formToConfig(form: McpServerFormState): McpServerConfig {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    transport: form.transport,
    command: form.command.trim(),
    url: form.url.trim(),
    args: parseMultilineList(form.argsText),
    env: parseEnvLines(form.envText),
    headers: parseHeadersLines(form.headersText),
    enabled: form.enabled,
  };
}

function configToForm(config: McpServerConfig): McpServerFormState {
  const normalized = normalizeMcpServerConfig(config);

  return {
    id: normalized.id,
    name: normalized.name,
    transport: normalized.transport,
    command: normalized.command,
    url: normalized.url,
    argsText: formatMultilineList(normalized.args),
    envText: formatEnvLines(normalized.env),
    headersText: formatHeadersLines(normalized.headers),
    enabled: normalized.enabled,
  };
}

export function McpServersSettingsPanel() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [authStatus, setAuthStatus] = useState<
    Record<string, { authenticated: boolean; message?: string }>
  >({});
  const [editing, setEditing] = useState<McpServerFormState | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    const list = await listMcpServers();
    setServers(list);

    const statuses = await Promise.all(
      list
        .filter((server) => isRemoteMcpServer(server))
        .map(async (server) => {
          try {
            const status = await getMcpOAuthStatus(server.id);
            return [
              server.id,
              {
                authenticated: status.authenticated,
                message: status.message,
              },
            ] as const;
          } catch {
            return [server.id, { authenticated: false }] as const;
          }
        })
    );
    setAuthStatus(Object.fromEntries(statuses));
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  function handleAdd() {
    setEditing(createDefaultConfig());
    setOriginalId(null);
    setShowDialog(true);
  }

  async function handleEdit(id: string) {
    const server = await getMcpServer(id);
    if (!server) {
      return;
    }
    setEditing(configToForm(server));
    setOriginalId(id);
    setShowDialog(true);
  }

  async function handleSave() {
    if (!editing) {
      return;
    }

    const config = formToConfig(editing);
    if (!config.id || !config.name) {
      return;
    }
    if (config.transport === "stdio" && !config.command) {
      return;
    }
    if (config.transport === "http" && !config.url) {
      return;
    }

    if (originalId && originalId !== config.id) {
      await deleteMcpServer(originalId);
    }

    await saveMcpServer(config);
    setShowDialog(false);
    setEditing(null);
    setOriginalId(null);
    await loadServers();
  }

  async function handleDelete() {
    if (!deleteId) {
      return;
    }
    await revokeMcpOAuth(deleteId).catch(() => undefined);
    await deleteMcpServer(deleteId);
    setDeleteId(null);
    await loadServers();
  }

  async function handleToggleEnabled(server: McpServerConfig) {
    await saveMcpServer({ ...server, enabled: !server.enabled });
    await loadServers();
  }

  async function handleTest(server: McpServerConfig) {
    setTestingId(server.id);
    try {
      const result = await testMcpConnection(server);
      notifyMcpTestResult({
        serverName: server.name,
        result,
        onAuthorize: () => void handleAuthorize(server),
        t,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifyMcpTestResult({
        serverName: server.name,
        result: {
          ok: false,
          message,
          toolCount: 0,
          authRequired: isMcpAuthRequiredMessage(message),
        },
        onAuthorize: () => void handleAuthorize(server),
        t,
      });
    } finally {
      setTestingId(null);
    }
  }

  async function handleAuthorize(server: McpServerConfig) {
    setAuthorizingId(server.id);
    try {
      await startMcpOAuth(server);
      notifyMcpOAuthStarted(server.name, t);
      window.setTimeout(() => {
        void loadServers();
      }, 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifyMcpOAuthFailed({
        serverName: server.name,
        message,
        t,
      });
    } finally {
      setAuthorizingId(null);
    }
  }

  async function handleRevokeAuth(server: McpServerConfig) {
    await revokeMcpOAuth(server.id);
    await loadServers();
  }

  const canSave =
    editing &&
    editing.id.trim().length > 0 &&
    editing.name.trim().length > 0 &&
    ((editing.transport === "stdio" && editing.command.trim().length > 0) ||
      (editing.transport === "http" && editing.url.trim().length > 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">
            {t("settings.mcpServers.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("settings.mcpServers.description")}
          </p>
        </div>
        <Button onClick={handleAdd} type="button" variant="outline">
          <Plus className="size-4" />
          {t("settings.mcpServers.addButton")}
        </Button>
      </div>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t("settings.mcpServers.emptyState")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {servers.map((server) => (
            <McpServerCard
              key={server.id}
              server={server}
              authenticated={authStatus[server.id]?.authenticated ?? false}
              onEdit={() => void handleEdit(server.id)}
              onDelete={() => setDeleteId(server.id)}
              onTest={() => void handleTest(server)}
              onAuthorize={() => void handleAuthorize(server)}
              onRevokeAuth={() => void handleRevokeAuth(server)}
              onToggleEnabled={() => void handleToggleEnabled(server)}
              isTesting={testingId === server.id}
              isAuthorizing={authorizingId === server.id}
            />
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {originalId
                ? t("settings.mcpServers.editDialogTitle")
                : t("settings.mcpServers.addDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("settings.mcpServers.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mcp-id">{t("settings.mcpServers.idLabel")}</Label>
                <Input
                  id="mcp-id"
                  value={editing.id}
                  onChange={(event) =>
                    setEditing({ ...editing, id: event.target.value })
                  }
                  placeholder={t("settings.mcpServers.idPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-name">
                  {t("settings.mcpServers.nameLabel")}
                </Label>
                <Input
                  id="mcp-name"
                  value={editing.name}
                  onChange={(event) =>
                    setEditing({ ...editing, name: event.target.value })
                  }
                  placeholder={t("settings.mcpServers.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("settings.mcpServers.transportLabel")}</Label>
                <SettingSelect
                  aria-label={t("settings.mcpServers.transportLabel")}
                  value={editing.transport}
                  onValueChange={(value) =>
                    setEditing({
                      ...editing,
                      transport: value as McpTransport,
                    })
                  }
                  options={TRANSPORT_OPTIONS.map((transport) => ({
                    value: transport,
                    label: t(`settings.mcpServers.transports.${transport}`),
                  }))}
                />
              </div>

              {editing.transport === "http" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="mcp-url">
                      {t("settings.mcpServers.urlLabel")}
                    </Label>
                    <Input
                      id="mcp-url"
                      value={editing.url}
                      onChange={(event) =>
                        setEditing({ ...editing, url: event.target.value })
                      }
                      placeholder={t("settings.mcpServers.urlPlaceholder")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mcp-headers">
                      {t("settings.mcpServers.headersLabel")}
                    </Label>
                    <Textarea
                      id="mcp-headers"
                      value={editing.headersText}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          headersText: event.target.value,
                        })
                      }
                      placeholder={t("settings.mcpServers.headersPlaceholder")}
                      rows={2}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="mcp-command">
                      {t("settings.mcpServers.commandLabel")}
                    </Label>
                    <Input
                      id="mcp-command"
                      value={editing.command}
                      onChange={(event) =>
                        setEditing({ ...editing, command: event.target.value })
                      }
                      placeholder={t("settings.mcpServers.commandPlaceholder")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mcp-args">
                      {t("settings.mcpServers.argsLabel")}
                    </Label>
                    <Textarea
                      id="mcp-args"
                      value={editing.argsText}
                      onChange={(event) =>
                        setEditing({ ...editing, argsText: event.target.value })
                      }
                      placeholder={t("settings.mcpServers.argsPlaceholder")}
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="mcp-env">
                  {t("settings.mcpServers.envLabel")}
                </Label>
                <Textarea
                  id="mcp-env"
                  value={editing.envText}
                  onChange={(event) =>
                    setEditing({ ...editing, envText: event.target.value })
                  }
                  placeholder={t("settings.mcpServers.envPlaceholder")}
                  rows={3}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDialog(false)}
            >
              {t("settings.mcpServers.cancel")}
            </Button>
            <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
              {t("settings.mcpServers.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.mcpServers.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.mcpServers.deleteConfirmDescription", {
                name: deleteId ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("settings.mcpServers.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              {t("settings.mcpServers.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
