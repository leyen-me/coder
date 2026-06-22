import { useState, useEffect, useCallback } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Plus, Trash2, Play, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SettingSelect } from "./setting-select";
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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  listRemoteTargets,
  saveRemoteTarget,
  deleteRemoteTarget,
} from "@/lib/db/remote-targets";
import type { RemoteTargetAuth, RemoteTargetConfig } from "@/lib/db/types";

type AuthType = RemoteTargetAuth["type"];

const AUTH_OPTIONS: AuthType[] = ["agent", "key", "keyContent", "password"];

function createDefaultConfig(): RemoteTargetConfig {
  return {
    alias: "",
    host: "",
    port: 22,
    user: "",
    auth: { type: "agent" },
  };
}

function authTypeLabel(t: (key: string) => string, type: AuthType): string {
  switch (type) {
    case "agent":
      return t("settings.remoteTargets.authTypes.agent");
    case "key":
      return t("settings.remoteTargets.authTypes.key");
    case "keyContent":
      return t("settings.remoteTargets.authTypes.keyContent");
    case "password":
      return t("settings.remoteTargets.authTypes.password");
  }
}

function authValueForType(auth: RemoteTargetAuth): string {
  switch (auth.type) {
    case "agent":
      return "";
    case "key":
      return auth.keyPath;
    case "keyContent":
      return auth.content;
    case "password":
      return auth.password;
  }
}

function setAuthValue(
  auth: RemoteTargetAuth,
  value: string
): RemoteTargetAuth {
  switch (auth.type) {
    case "agent":
      return auth;
    case "key":
      return { type: "key", keyPath: value };
    case "keyContent":
      return { type: "keyContent", content: value };
    case "password":
      return { type: "password", password: value };
  }
}

export function RemoteTargetsSettingsPanel() {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<RemoteTargetConfig[]>([]);
  const [editing, setEditing] = useState<RemoteTargetConfig | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteAlias, setDeleteAlias] = useState<string | null>(null);
  const [testingAlias, setTestingAlias] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    alias: string;
    ok: boolean;
    message: string;
  } | null>(null);

  const loadTargets = useCallback(async () => {
    const list = await listRemoteTargets();
    setTargets(list);
  }, []);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  function handleAdd() {
    setEditing(createDefaultConfig());
    setShowDialog(true);
  }

  function handleEdit(target: RemoteTargetConfig) {
    setEditing({ ...target });
    setShowDialog(true);
  }

  function handleDelete(alias: string) {
    setDeleteAlias(alias);
  }

  async function confirmDelete() {
    if (deleteAlias) {
      await deleteRemoteTarget(deleteAlias);
      setDeleteAlias(null);
      await loadTargets();
    }
  }

  function handleSave() {
    if (!editing) return;
    saveRemoteTarget(editing).then(() => {
      setShowDialog(false);
      setEditing(null);
      loadTargets();
    });
  }

  async function handleTestConnection(alias: string) {
    setTestingAlias(alias);
    setTestResult(null);

    if (!isTauri()) {
      setTestResult({
        alias,
        ok: false,
        message: "Test connection is only available in the desktop app",
      });
      setTestingAlias(null);
      return;
    }

    try {
      const result = await invoke<{ ok: boolean; message: string }>(
        "test_remote_connection",
        { config: targets.find((t) => t.alias === alias) }
      );
      setTestResult({ alias, ...result });
    } catch (error) {
      setTestResult({
        alias,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTestingAlias(null);
    }
  }

  return (
    <section className="divide-y">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h3 className="text-sm font-medium">
            {t("settings.remoteTargets.title")}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("settings.remoteTargets.description")}
          </p>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="mr-1 h-4 w-4" />
          {t("settings.remoteTargets.addButton")}
        </Button>
      </div>

      {targets.length === 0 && (
        <div className="text-muted-foreground py-8 text-center text-sm">
          {t("settings.remoteTargets.emptyState")}
        </div>
      )}

      {targets.map((target) => (
        <div
          key={target.alias}
          className="flex items-center justify-between py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{target.alias}</span>
              <Badge variant="outline" className="text-xs">
                {target.user}@{target.host}:{target.port}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {authTypeLabel(t as (key: string) => string, target.auth.type)}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTestConnection(target.alias)}
              disabled={testingAlias === target.alias}
              aria-label={t("settings.remoteTargets.testConnection")}
            >
              {testingAlias === target.alias ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(target)}
              aria-label={t("settings.remoteTargets.edit")}
            >
              {t("settings.remoteTargets.edit")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(target.alias)}
              aria-label={t("settings.remoteTargets.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      {testResult && (
        <div
          className={`mt-2 rounded-md p-3 text-sm ${
            testResult.ok
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          <strong>{testResult.alias}:</strong> {testResult.message}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.alias && targets.find((t) => t.alias === editing.alias)
                ? t("settings.remoteTargets.editDialogTitle")
                : t("settings.remoteTargets.addDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("settings.remoteTargets.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="alias">
                  {t("settings.remoteTargets.aliasLabel")}
                </Label>
                <Input
                  id="alias"
                  value={editing.alias}
                  onChange={(e) =>
                    setEditing({ ...editing, alias: e.target.value })
                  }
                  placeholder={t("settings.remoteTargets.aliasPlaceholder")}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="host">
                  {t("settings.remoteTargets.hostLabel")}
                </Label>
                <Input
                  id="host"
                  value={editing.host}
                  onChange={(e) =>
                    setEditing({ ...editing, host: e.target.value })
                  }
                  placeholder={t("settings.remoteTargets.hostPlaceholder")}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="port">
                  {t("settings.remoteTargets.portLabel")}
                </Label>
                <Input
                  id="port"
                  type="number"
                  value={editing.port}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      port: parseInt(e.target.value, 10) || 22,
                    })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="user">
                  {t("settings.remoteTargets.userLabel")}
                </Label>
                <Input
                  id="user"
                  value={editing.user}
                  onChange={(e) =>
                    setEditing({ ...editing, user: e.target.value })
                  }
                  placeholder={t("settings.remoteTargets.userPlaceholder")}
                />
              </div>

              <div className="grid gap-2">
                <Label>{t("settings.remoteTargets.authTypeLabel")}</Label>
                <SettingSelect
                  value={editing.auth.type}
                  options={AUTH_OPTIONS.map((opt) => ({
                    value: opt,
                    label: authTypeLabel(t as (key: string) => string, opt),
                  }))}
                  onValueChange={(value: AuthType) => {
                    const newAuth: RemoteTargetAuth =
                      value === "agent"
                        ? { type: "agent" }
                        : value === "key"
                          ? { type: "key", keyPath: "" }
                          : value === "keyContent"
                            ? { type: "keyContent", content: "" }
                            : { type: "password", password: "" };
                    setEditing({ ...editing, auth: newAuth });
                  }}
                  aria-label={t("settings.remoteTargets.authTypeLabel")}
                />
              </div>

              {(editing.auth.type === "key" ||
                editing.auth.type === "keyContent" ||
                editing.auth.type === "password") && (
                <div className="grid gap-2">
                  <Label htmlFor="auth-value">
                    {editing.auth.type === "password"
                      ? t("settings.remoteTargets.passwordLabel")
                      : editing.auth.type === "key"
                        ? t("settings.remoteTargets.keyPathLabel")
                        : t("settings.remoteTargets.keyContentLabel")}
                  </Label>
                  {editing.auth.type === "password" ? (
                    <PasswordInput
                      id="auth-value"
                      value={authValueForType(editing.auth)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          auth: setAuthValue(editing.auth, e.target.value),
                        })
                      }
                      placeholder={t(
                        "settings.remoteTargets.passwordPlaceholder"
                      )}
                      showPasswordLabel={t(
                        "settings.remoteTargets.passwordShowAriaLabel"
                      )}
                      hidePasswordLabel={t(
                        "settings.remoteTargets.passwordHideAriaLabel"
                      )}
                    />
                  ) : (
                    <Input
                      id="auth-value"
                      value={authValueForType(editing.auth)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          auth: setAuthValue(editing.auth, e.target.value),
                        })
                      }
                      placeholder={
                        editing.auth.type === "key"
                          ? t("settings.remoteTargets.keyPathPlaceholder")
                          : t(
                              "settings.remoteTargets.keyContentPlaceholder"
                            )
                      }
                    />
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t("settings.remoteTargets.cancel")}
            </Button>
            <Button onClick={handleSave}>
              {t("settings.remoteTargets.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteAlias !== null}
        onOpenChange={() => setDeleteAlias(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.remoteTargets.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.remoteTargets.deleteConfirmDescription", {
                alias: deleteAlias ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("settings.remoteTargets.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("settings.remoteTargets.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
