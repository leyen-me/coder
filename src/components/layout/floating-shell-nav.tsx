import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { TITLE_BAR_CLASS } from "./constants";
import { TitleBarNavButton } from "./title-bar-nav-button";

type FloatingShellNavProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onBack?: () => void;
};

/** Window nav controls that float above the shell; unaffected by sidebar collapse. */
export function FloatingShellNav({
  isSidebarOpen,
  onToggleSidebar,
  onBack,
}: FloatingShellNavProps) {
  const { t } = useTranslation();

  return (
    <header
      className={cn(
        TITLE_BAR_CLASS,
        "pointer-events-none absolute left-0 top-0 z-50 flex items-center",
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
        <TitleBarNavButton
          label={t("titleBar.back")}
          icon={ArrowLeft}
          onClick={onBack}
        />
        <TitleBarNavButton label={t("titleBar.forward")} icon={ArrowRight} />
      </nav>
    </header>
  );
}
