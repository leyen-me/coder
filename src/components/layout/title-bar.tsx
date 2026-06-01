import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";

import { TITLE_BAR_CLASS } from "./constants";
import { TitleBarDragRegion } from "./title-bar-drag-region";
import { TitleBarNavButton } from "./title-bar-nav-button";
import { WindowControls } from "./window-controls";

const NAV_ITEMS = [
  { label: "切换侧栏", icon: PanelLeft },
  { label: "后退", icon: ArrowLeft },
  { label: "前进", icon: ArrowRight },
] as const;

export function TitleBar() {
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
        {NAV_ITEMS.map(({ label, icon }) => (
          <TitleBarNavButton key={label} label={label} icon={icon} />
        ))}
      </nav>

      <TitleBarDragRegion />

      <WindowControls />
    </header>
  );
}
