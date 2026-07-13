import { AlertCircleIcon, CheckCircleIcon, LoaderIcon, MailIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { getKVStore } from "@/lib/storage";

import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";
import { sendTestEmail } from "../lib/send-test-email";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EmailSettings = {
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  fromAddress: string;
  useTls: boolean;
};

type EmailSettingsStore = {
  currentProvider: string;
  profiles: Record<string, EmailSettings>;
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

const providerOptions = [
  { value: "qq", label: "QQ Mail" },
  { value: "outlook", label: "Outlook" },
  { value: "gmail", label: "Gmail" },
  { value: "163", label: "163 Mail" },
];

function getDefaultProfile(provider: string): EmailSettings {
  const preset = PROVIDER_PRESETS[provider];
  return {
    smtpHost: preset?.smtpHost ?? "",
    smtpPort: preset?.smtpPort ?? 465,
    username: "",
    password: "",
    fromAddress: "",
    useTls: preset?.useTls ?? true,
  };
}

function readStore(): EmailSettingsStore {
  try {
    const raw = getKVStore().getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // New format: { currentProvider, profiles }
      if (parsed.profiles && parsed.currentProvider) {
        return parsed as EmailSettingsStore;
      }
      // Legacy flat format: migrate to per-provider profiles
      const legacy = parsed as Record<string, unknown>;
      const provider = (legacy.provider as string) || "qq";
      const preset = PROVIDER_PRESETS[provider];
      const migrated: EmailSettingsStore = {
        currentProvider: provider,
        profiles: {
          [provider]: {
            smtpHost: (legacy.smtpHost as string) ?? preset?.smtpHost ?? "",
            smtpPort: (legacy.smtpPort as number) ?? preset?.smtpPort ?? 465,
            username: (legacy.username as string) ?? "",
            password: (legacy.password as string) ?? "",
            fromAddress: (legacy.fromAddress as string) ?? "",
            useTls: (legacy.useTls as boolean) ?? preset?.useTls ?? true,
          },
        },
      };
      return migrated;
    }
  } catch {
    // ignore
  }
  // Fresh start
  return {
    currentProvider: "qq",
    profiles: { qq: getDefaultProfile("qq") },
  };
}

function writeStore(store: EmailSettingsStore): void {
  getKVStore().setItem(STORAGE_KEY, JSON.stringify(store));
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

export function EmailSettingsPanel() {
  const { t } = useTranslation();
  const [currentProvider, setCurrentProvider] = useState<string>("qq");
  const [profiles, setProfiles] = useState<Record<string, EmailSettings>>({});
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  // Initialise from store
  useEffect(() => {
    const store = readStore();
    setCurrentProvider(store.currentProvider);
    setProfiles(store.profiles);
  }, []);

  // Re-read on storage-ready event (used by Tauri native menu etc.)
  useEffect(() => {
    const handleStorageReady = () => {
      const store = readStore();
      setCurrentProvider(store.currentProvider);
      setProfiles(store.profiles);
    };
    window.addEventListener("coder:storage-ready", handleStorageReady);
    return () => window.removeEventListener("coder:storage-ready", handleStorageReady);
  }, []);

  // Derive current settings from current provider + profiles
  const settings: EmailSettings =
    profiles[currentProvider] ?? getDefaultProfile(currentProvider);

  const persistStore = useCallback(
    (nextProvider: string, nextProfiles: Record<string, EmailSettings>) => {
      writeStore({ currentProvider: nextProvider, profiles: nextProfiles });
    },
    [],
  );

  const updateField = useCallback(
    <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
      setProfiles((prev) => {
        const current = prev[currentProvider] ?? getDefaultProfile(currentProvider);
        const updated = {
          ...prev,
          [currentProvider]: { ...current, [key]: value },
        };
        persistStore(currentProvider, updated);
        return updated;
      });
    },
    [currentProvider, persistStore],
  );

  const handleProviderChange = useCallback(
    (nextProvider: string) => {
      setProfiles((prev) => {
        // Ensure the new provider has a profile; create a default one if first visit
        const nextProfiles = { ...prev };
        if (!nextProfiles[nextProvider]) {
          nextProfiles[nextProvider] = getDefaultProfile(nextProvider);
        }
        persistStore(nextProvider, nextProfiles);
        return nextProfiles;
      });
      setCurrentProvider(nextProvider);
      // Reset test status when switching provider
      setTestStatus("idle");
      setTestMessage("");
    },
    [persistStore],
  );

  const handleTestSend = useCallback(async () => {
    setTestStatus("sending");
    setTestMessage("");

    try {
      const message = await sendTestEmail(
        settings,
        t("settings.email.testSubject"),
        t("settings.email.testBody"),
      );
      setTestStatus("success");
      setTestMessage(message);
    } catch (error) {
      setTestStatus("error");
      setTestMessage(error instanceof Error ? error.message : String(error));
    }
  }, [settings, t]);

  const canTest =
    settings.smtpHost.trim() !== "" &&
    settings.username.trim() !== "" &&
    settings.password.trim() !== "" &&
    settings.fromAddress.trim() !== "";

  return (
    <section className="divide-y">
      {/* Provider preset */}
      <SettingRow
        label={t("settings.email.providerLabel")}
        description={t("settings.email.providerDescription")}
        control={
          <SettingSelect
            value={currentProvider}
            options={providerOptions}
            onValueChange={handleProviderChange}
            aria-label={t("settings.email.providerAriaLabel")}
          />
        }
      />

      {/* SMTP host */}
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
