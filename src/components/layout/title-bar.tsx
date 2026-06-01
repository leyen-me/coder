import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";

import { useTranslation } from "@/lib/i18n/locale-provider";

import { TITLE_BAR_CLASS } from "./constants";
import { TitleBarDragRegion } from "./title-bar-drag-region";
import { TitleBarNavButton } from "./title-bar-nav-button";
import { WindowControls } from "./window-controls";

type TitleBarProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onBack?: () => void;
};

export function TitleBar({
  isSidebarOpen,
  onToggleSidebar,
  onBack,
}: TitleBarProps) {
  const { t } = useTranslation();

  return (
    <header
      className={`flex ${TITLE_BAR_CLASS} items-stretch overflow-hidden border-b bg-background`}
      role="banner"
      aria-label={t("titleBar.ariaLabel")}
    >
      <nav
        aria-label={t("titleBar.windowNav")}
        className="flex items-center gap-0.5 self-center pl-2"
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

      <TitleBarDragRegion />

      <WindowControls />
    </header>
  );
}
