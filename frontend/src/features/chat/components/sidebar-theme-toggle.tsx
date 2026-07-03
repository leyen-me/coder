import { Moon, Sun } from "lucide-react";

import { useLocale } from "@/lib/i18n/locale-provider";
import { useTheme } from "@/lib/theme/theme-provider";

import { SidebarNavItem } from "./sidebar-nav-item";

export function SidebarThemeToggle() {
  const { resolved, setPreference } = useTheme();
  const { t } = useLocale();
  const themeLabel = t(`theme.${resolved}`);
  const isDark = resolved === "dark";

  return (
    <SidebarNavItem
      icon={isDark ? Moon : Sun}
      label={t("sidebar.theme")}
      onClick={() => setPreference(isDark ? "light" : "dark")}
      aria-label={t("sidebar.themeAriaLabel", { theme: themeLabel })}
    />
  );
}
