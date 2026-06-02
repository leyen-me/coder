import { APP_SIDEBAR_WIDTH_PX } from "@/components/layout/constants";
import { TitleBarDragRegion } from "@/components/layout/title-bar-drag-region";
import { SidebarNavItem } from "@/features/chat/components/sidebar-nav-item";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { SETTINGS_CATEGORIES } from "../constants";
import type { SettingsCategoryId } from "../types";

type SettingsSidebarProps = {
  open: boolean;
  selectedCategory: SettingsCategoryId;
  onSelectCategory: (category: SettingsCategoryId) => void;
};

export function SettingsSidebar({
  open,
  selectedCategory,
  onSelectCategory,
}: SettingsSidebarProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{ width: open ? APP_SIDEBAR_WIDTH_PX : 0 }}
      className={cn(
        "flex h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width,border-color] duration-300 ease-in-out",
        !open && "border-transparent"
      )}
      aria-hidden={!open}
    >
      <aside
        style={{ width: APP_SIDEBAR_WIDTH_PX }}
        className={cn(
          "flex h-full flex-col text-sidebar-foreground transition-opacity duration-300 ease-in-out",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <TitleBarDragRegion className="h-11 w-full shrink-0 flex-none" />

        <div className="flex shrink-0 items-center px-4 pb-2">
          <h2 className="text-sm font-semibold">{t("settings.title")}</h2>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 py-2">
          {SETTINGS_CATEGORIES.map((category) => (
            <SidebarNavItem
              key={category.id}
              icon={category.icon}
              label={t(`settings.categories.${category.id}`)}
              isActive={selectedCategory === category.id}
              onClick={() => onSelectCategory(category.id)}
            />
          ))}
        </nav>
      </aside>
    </div>
  );
}
