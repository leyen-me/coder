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
import { testMcpConnection } from "@/features/mcp/api";

import { McpServerCard } from "./mcp-server-card";
import {
  formatEnvLines,
  formatMultilineList,
  parseEnvLines,
  parseMultilineList,
} from "../lib/parse-mcp-form";

type McpServerFormState = {
  id: string;
  name: string;
  command: string;
  argsText: string;
  envText: string;
  enabled: boolean;
};

function createDefaultConfig(): McpServerFormState {
  return {
    id: "",
    name: "",
    command: "",
    argsText: "",
    envText: "",
    enabled: true,
  };
}

function formToConfig(form: McpServerFormState): McpServerConfig {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    command: form.command.trim(),
    args: parseMultilineList(form.argsText),
    env: parseEnvLines(form.envText),
    enabled: form.enabled,
  };
}

function configToForm(config: McpServerConfig): McpServerFormState {
  return {
    id: config.id,
    name: config.name,
    command: config.command,
    argsText: formatMultilineList(config.args),
    envText: formatEnvLines(config.env),
    enabled: config.enabled,
  };
}

export function McpServersSettingsPanel() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [editing, setEditing] = useState<McpServerFormState | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    message: string;
  } | null>(null);

  const loadServers = useCallback(async () => {
    const list = await listMcpServers();
    setServers(list);
  }, []);

  useEffect(() => {
    loadServers();
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
    if (!config.id || !config.name || !config.command) {
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
    setTestResult(null);
    try {
      const result = await testMcpConnection(server);
      setTestResult({
        id: server.id,
        ok: result.ok,
        message: result.message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTestResult({
        id: server.id,
        ok: false,
        message,
      });
    } finally {
      setTestingId(null);
    }
  }

  const canSave =
    editing &&
    editing.id.trim().length > 0 &&
    editing.name.trim().length > 0 &&
    editing.command.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
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
            <div key={server.id} className="space-y-2">
              <McpServerCard
                server={server}
                onEdit={() => void handleEdit(server.id)}
                onDelete={() => setDeleteId(server.id)}
                onTest={() => void handleTest(server)}
                onToggleEnabled={() => void handleToggleEnabled(server)}
                isTesting={testingId === server.id}
              />
              {testResult?.id === server.id ? (
                <p
                  className={
                    testResult.ok
                      ? "text-xs text-emerald-600 dark:text-emerald-400"
                      : "text-xs text-destructive"
                  }
                >
                  {testResult.message}
                </p>
              ) : null}
            </div>
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
