import { ResponsiveSidebarPanel } from "@/components/layout/responsive-sidebar-panel";
import { TitleBarDragRegion } from "@/components/layout/title-bar-drag-region";
import { SidebarNavItem } from "@/features/chat/components/sidebar-nav-item";
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { MessageKey } from "@/lib/i18n/messages";
import { SETTINGS_CATEGORY_GROUPS } from "../constants";
import type { SettingsCategoryId } from "../types";

type SettingsSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCategory: SettingsCategoryId;
  onSelectCategory: (category: SettingsCategoryId) => void;
};

export function SettingsSidebar({
  open,
  onOpenChange,
  selectedCategory,
  onSelectCategory,
}: SettingsSidebarProps) {
  const { t } = useTranslation();

  return (
    <ResponsiveSidebarPanel
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel={t("settings.title")}
    >
      <TitleBarDragRegion className="h-11 w-full shrink-0 flex-none" />

      <div className="flex shrink-0 items-center px-4 pb-2">
        <h2 className="text-sm font-semibold">{t("settings.title")}</h2>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        {SETTINGS_CATEGORY_GROUPS.map((group) => (
          <div key={group.nameKey}>
            <p className="px-2 pb-0.5 pt-3 text-[11px] font-medium tracking-wider text-muted-foreground/60 uppercase">
              {t(group.nameKey as MessageKey)}
            </p>
            {group.items.map((category) => (
              <SidebarNavItem
                key={category.id}
                icon={category.icon}
                label={t(`settings.categories.${category.id}`)}
                isActive={selectedCategory === category.id}
                onClick={() => onSelectCategory(category.id)}
              />
            ))}
          </div>
        ))}
      </nav>
    </ResponsiveSidebarPanel>
  );
}
