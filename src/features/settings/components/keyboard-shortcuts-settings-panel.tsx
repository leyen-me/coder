import { Button } from "@/components/ui/button";
import {
  SHORTCUT_ACTION_GROUPS,
  getActionsForGroup,
} from "@/lib/keyboard-shortcuts/constants";
import { shortcutActionMessageKey } from "@/lib/keyboard-shortcuts/action-message-key";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts/keyboard-shortcuts-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { SettingRow } from "./setting-row";
import { ShortcutBindingEditor } from "./shortcut-binding-editor";

export function KeyboardShortcutsSettingsPanel() {
  const { t } = useTranslation();
  const { resetAllBindings } = useKeyboardShortcuts();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("settings.keyboardShortcuts.description")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={resetAllBindings}>
          {t("settings.keyboardShortcuts.resetAll")}
        </Button>
      </div>

      {SHORTCUT_ACTION_GROUPS.map((group) => {
        const actions = getActionsForGroup(group.id);

        return (
          <section key={group.id} className="divide-y">
            <h3 className="pb-2 text-sm font-semibold">
              {t(`settings.keyboardShortcuts.groups.${group.id}`)}
            </h3>
            {actions.map((action) => (
              <SettingRow
                key={action.id}
                label={t(shortcutActionMessageKey(action.id, "label"))}
                description={t(shortcutActionMessageKey(action.id, "description"))}
                control={<ShortcutBindingEditor actionId={action.id} />}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
