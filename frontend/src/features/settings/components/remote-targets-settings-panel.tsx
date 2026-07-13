import { Plus } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/locale-provider";
import {
  listRemoteTargets,
  getRemoteTarget,
  saveRemoteTarget,
  deleteRemoteTarget,
} from "@/lib/db/remote-targets";
import type { RemoteTargetAuth, RemoteTargetConfig } from "@/lib/db/types";

import { RemoteTargetCard } from "./remote-target-card";
import { testRemoteConnection } from "../lib/test-remote-connection";

type AuthType = RemoteTargetAuth["type"];

const AUTH_OPTIONS: AuthType[] = ["agent", "key", "keyContent", "password"];

function createDefaultConfig(): RemoteTargetConfig {
  return {
    alias: "",
    host: "",
    port: 22,
    user: "",
    auth: { type: "agent" },
    enabled: true,
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
  const [originalAlias, setOriginalAlias] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteAlias, setDeleteAlias] = useState<string | null>(null);
  const [testingAlias, setTestingAlias] = useState<string | null>(null);

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
    setOriginalAlias(target.alias);
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
    const aliasChanged = originalAlias && originalAlias !== editing.alias;
    const promise = aliasChanged
      ? deleteRemoteTarget(originalAlias).then(() => saveRemoteTarget(editing))
      : saveRemoteTarget(editing);
    promise.then(() => {
      setShowDialog(false);
      setEditing(null);
      setOriginalAlias(null);
      loadTargets();
    });
  }

  async function handleTestConnection(alias: string) {
    setTestingAlias(alias);

    const target =
      targets.find((item) => item.alias === alias) ??
      (await getRemoteTarget(alias));
    if (!target) {
      toast.error(t("settings.remoteTargets.testFailed"), {
        description: "Target not found",
      });
      setTestingAlias(null);
      return;
    }

    try {
      const result = await testRemoteConnection(target);
      if (result.ok) {
        toast.success(t("settings.remoteTargets.testSuccess"), {
          description: result.message,
        });
      } else {
        toast.error(t("settings.remoteTargets.testFailed"), {
          description: result.message,
        });
      }
    } catch (error) {
      toast.error(t("settings.remoteTargets.testFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTestingAlias(null);
    }
  }

  function handleToggleEnabled(target: RemoteTargetConfig) {
    const updated = { ...target, enabled: !target.enabled };
    saveRemoteTarget(updated).then(() => {
      loadTargets();
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-medium tracking-tight">
            {t("settings.remoteTargets.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("settings.remoteTargets.description")}
          </p>
        </div>
        <Button onClick={handleAdd} type="button" variant="outline">
          <Plus className="size-4" />
          {t("settings.remoteTargets.addButton")}
        </Button>
      </div>

      {targets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-4xl border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {t("settings.remoteTargets.emptyState")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {targets.map((target) => (
              <RemoteTargetCard
                key={target.alias}
                target={target}
                isTesting={testingAlias === target.alias}
                onEdit={() => handleEdit(target)}
                onDelete={() => handleDelete(target.alias)}
                onTest={() => void handleTestConnection(target.alias)}
                onToggleEnabled={() => handleToggleEnabled(target)}
              />
            ))}
        </div>
        </>
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
