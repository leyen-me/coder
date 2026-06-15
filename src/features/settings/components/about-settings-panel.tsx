import { useEffect, useState } from "react";

import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-provider";
import { useGitHubRelease } from "@/features/update/use-github-release";

import { SettingRow } from "./setting-row";

const FALLBACK_VERSION = "0.0.0";

export function AboutSettingsPanel() {
  const { t } = useLocale();
  const { hasUpdate, tag, url, loading, refresh } = useGitHubRelease();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) {
      setCurrentVersion(FALLBACK_VERSION);
    } else {
      void getVersion()
        .then(setCurrentVersion)
        .catch(() => setCurrentVersion(FALLBACK_VERSION));
    }
  }, []);

  const handleViewRelease = () => {
    if (url) {
      void openUrl(url);
    }
  };

  return (
    <section className="divide-y">
      <SettingRow
        label={t("settings.about.currentVersion")}
        control={
          <span className="text-sm tabular-nums text-muted-foreground">
            {currentVersion ?? "—"}
          </span>
        }
      />

      <SettingRow
        label={t("settings.about.latestVersion")}
        control={
          <span className="text-sm tabular-nums text-muted-foreground">
            {loading ? t("settings.about.checking") : tag ?? "—"}
          </span>
        }
      />

      <SettingRow
        label={t("settings.about.checkUpdate")}
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={refresh}
          >
            {loading ? t("settings.about.checking") : t("settings.about.checkUpdate")}
          </Button>
        }
      />

      {url && (
        <SettingRow
          label={t("settings.about.viewRelease")}
          description={
            hasUpdate
              ? `${tag} ${t("settings.about.latestVersion")}`
              : t("settings.about.upToDate")
          }
          control={
            <Button
              type="button"
              variant={hasUpdate ? "default" : "outline"}
              size="sm"
              onClick={handleViewRelease}
            >
              {t("settings.about.viewRelease")}
            </Button>
          }
        />
      )}
    </section>
  );
}
