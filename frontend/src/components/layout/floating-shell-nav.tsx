import { ArrowLeft, PanelLeft, Search } from "lucide-react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { TITLE_BAR_CLASS } from "./constants";
import { TitleBarNavButton } from "./title-bar-nav-button";

type FloatingShellNavProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSearch?: () => void;
  showSearch?: boolean;
  onBack?: () => void;
  showBack?: boolean;
  canGoBack?: boolean;
};

/** Window nav controls that float above the shell; unaffected by sidebar collapse. */
export function FloatingShellNav({
  isSidebarOpen,
  onToggleSidebar,
  onSearch,
  showSearch = true,
  onBack,
  showBack = false,
  canGoBack = false,
}: FloatingShellNavProps) {
  const { t } = useTranslation();

  return (
    <header
      className={cn(
        TITLE_BAR_CLASS,
        "pointer-events-none absolute left-0 top-0 z-[60] flex items-center",
      )}
      role="banner"
      aria-label={t("titleBar.ariaLabel")}
    >
      <nav
        aria-label={t("titleBar.windowNav")}
        className="pointer-events-auto flex items-center gap-0.5 pl-2"
      >
        <TitleBarNavButton
          label={t("titleBar.toggleSidebar")}
          icon={PanelLeft}
          isActive={isSidebarOpen}
          onClick={onToggleSidebar}
        />
        {showBack ? (
          <TitleBarNavButton
            label={t("titleBar.back")}
            icon={ArrowLeft}
            disabled={!canGoBack && !onBack}
            onClick={onBack}
          />
        ) : null}
        {showSearch && onSearch ? (
          <TitleBarNavButton
            label={t("titleBar.search")}
            icon={Search}
            onClick={onSearch}
          />
        ) : null}
      </nav>
    </header>
  );
}
