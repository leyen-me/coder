import { invoke } from "@tauri-apps/api/core";
import { AlertCircleIcon, CheckCircleIcon, LoaderIcon, MailIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { getKVStore } from "@/lib/storage";

import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EmailSettings = {
  provider: string;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  fromAddress: string;
  useTls: boolean;
};

const STORAGE_KEY = "coder:email-settings";

const PROVIDER_PRESETS: Record<
  string,
  { smtpHost: string; smtpPort: number; useTls: boolean }
> = {
  qq: { smtpHost: "smtp.qq.com", smtpPort: 465, useTls: true },
  outlook: { smtpHost: "smtp-mail.outlook.com", smtpPort: 587, useTls: false },
  gmail: { smtpHost: "smtp.gmail.com", smtpPort: 587, useTls: false },
  "163": { smtpHost: "smtp.163.com", smtpPort: 465, useTls: true },
};

const DEFAULT_SETTINGS: EmailSettings = {
  provider: "qq",
  ...PROVIDER_PRESETS["qq"],
  username: "",
  password: "",
  fromAddress: "",
};

function readSettings(): EmailSettings {
  try {
    const raw = getKVStore().getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EmailSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

function writeSettings(settings: EmailSettings): void {
  getKVStore().setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

export function EmailSettingsPanel() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<EmailSettings>(readSettings);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    writeSettings(settings);
  }, [settings]);

  const updateField = useCallback(
    <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleProviderChange = useCallback((provider: string) => {
    const preset = PROVIDER_PRESETS[provider];
    if (preset) {
      setSettings((prev) => ({
        ...prev,
        provider,
        smtpHost: preset.smtpHost,
        smtpPort: preset.smtpPort,
        useTls: preset.useTls,
      }));
    }
  }, []);

  const handleTestSend = useCallback(async () => {
    setTestStatus("sending");
    setTestMessage("");

    try {
      const result = await invoke<string>("send_email", {
        request: {
          settings: {
            smtpHost: settings.smtpHost,
            smtpPort: settings.smtpPort,
            username: settings.username,
            password: settings.password,
            fromAddress: settings.fromAddress,
            useTls: settings.useTls,
          },
          to: settings.fromAddress,
          subject: t("settings.email.testSubject"),
          body: t("settings.email.testBody"),
        },
      });
      setTestStatus("success");
      setTestMessage(result);
    } catch (err) {
      setTestStatus("error");
      setTestMessage(typeof err === "string" ? err : String(err));
    }
  }, [settings, t]);

  const canTest =
    settings.smtpHost.trim() !== "" &&
    settings.username.trim() !== "" &&
    settings.password.trim() !== "" &&
    settings.fromAddress.trim() !== "";

  const providerOptions = [
    { value: "qq", label: "QQ Mail" },
    { value: "outlook", label: "Outlook" },
    { value: "gmail", label: "Gmail" },
    { value: "163", label: "163 Mail" },
  ];

  return (
    <section className="divide-y">
      {/* Provider preset */}
      <SettingRow
        label={t("settings.email.providerLabel")}
        description={t("settings.email.providerDescription")}
        control={
          <SettingSelect
            value={settings.provider}
            options={providerOptions}
            onValueChange={handleProviderChange}
            aria-label={t("settings.email.providerAriaLabel")}
          />
        }
      />

      {/* SMTP host (readonly when preset selected) */}
      <SettingRow
        label={t("settings.email.smtpHostLabel")}
        description={t("settings.email.smtpHostDescription")}
        control={
          <Input
            className="w-44 font-mono text-xs"
            value={settings.smtpHost}
            onChange={(e) => updateField("smtpHost", e.target.value)}
            aria-label={t("settings.email.smtpHostAriaLabel")}
          />
        }
      />

      {/* Port */}
      <SettingRow
        label={t("settings.email.portLabel")}
        description={t("settings.email.portDescription")}
        control={
          <Input
            className="w-20 font-mono text-xs"
            type="number"
            min={1}
            max={65535}
            value={String(settings.smtpPort)}
            onChange={(e) => updateField("smtpPort", Number.parseInt(e.target.value) || 465)}
            aria-label={t("settings.email.portAriaLabel")}
          />
        }
      />

      {/* Username (full email address) */}
      <SettingRow
        label={t("settings.email.usernameLabel")}
        description={t("settings.email.usernameDescription")}
        control={
          <Input
            className="w-60 font-mono text-xs"
            value={settings.username}
            onChange={(e) => updateField("username", e.target.value)}
            placeholder={t("settings.email.usernamePlaceholder")}
            aria-label={t("settings.email.usernameAriaLabel")}
          />
        }
      />

      {/* Authorization code (password) */}
      <SettingRow
        label={t("settings.email.passwordLabel")}
        description={t("settings.email.passwordDescription")}
        control={
          <PasswordInput
            className="w-60 font-mono text-xs"
            showPasswordLabel={t("settings.email.passwordShowAriaLabel")}
            hidePasswordLabel={t("settings.email.passwordHideAriaLabel")}
            value={settings.password}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder={t("settings.email.passwordPlaceholder")}
            aria-label={t("settings.email.passwordAriaLabel")}
          />
        }
      />

      {/* From address (defaults to username) */}
      <SettingRow
        label={t("settings.email.fromAddressLabel")}
        description={t("settings.email.fromAddressDescription")}
        control={
          <Input
            className="w-60 font-mono text-xs"
            value={settings.fromAddress}
            onChange={(e) => updateField("fromAddress", e.target.value)}
            placeholder={settings.username || t("settings.email.fromAddressPlaceholder")}
            aria-label={t("settings.email.fromAddressAriaLabel")}
          />
        }
      />

      {/* Test send */}
      <div className="flex items-start justify-between gap-8 py-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{t("settings.email.testSendLabel")}</p>
          <p className="text-sm text-muted-foreground">{t("settings.email.testSendDescription")}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button
            disabled={!canTest || testStatus === "sending"}
            onClick={handleTestSend}
            size="sm"
            type="button"
            variant="outline"
          >
            {testStatus === "sending" ? (
              <>
                <LoaderIcon className="size-3.5 animate-spin" />
                {t("settings.email.sending")}
              </>
            ) : (
              <>
                <MailIcon className="size-3.5" />
                {t("settings.email.testSend")}
              </>
            )}
          </Button>
          {testStatus === "success" ? (
            <div className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircleIcon className="size-3.5" />
              {testMessage}
            </div>
          ) : testStatus === "error" ? (
            <div className="flex max-w-[280px] items-start gap-1.5 break-words text-xs text-destructive">
              <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>{testMessage}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
