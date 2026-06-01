import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";

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
  return (
    <header
      className={`flex ${TITLE_BAR_CLASS} items-stretch overflow-hidden border-b bg-background`}
      role="banner"
      aria-label="标题栏"
    >
      <nav
        aria-label="窗口导航"
        className="flex items-center gap-0.5 self-center pl-2"
      >
        <TitleBarNavButton
          label="切换侧栏"
          icon={PanelLeft}
          isActive={isSidebarOpen}
          onClick={onToggleSidebar}
        />
        <TitleBarNavButton label="后退" icon={ArrowLeft} onClick={onBack} />
        <TitleBarNavButton label="前进" icon={ArrowRight} />
      </nav>

      <TitleBarDragRegion />

      <WindowControls />
    </header>
  );
}
