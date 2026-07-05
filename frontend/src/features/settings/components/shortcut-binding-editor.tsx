import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ShortcutKeys } from "@/features/keyboard-shortcuts/shortcut-keys";
import { getDefaultBinding } from "@/lib/keyboard-shortcuts/default-bindings";
import {
  bindingsConflict,
  eventToBinding,
  normalizeBinding,
} from "@/lib/keyboard-shortcuts/match";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts/keyboard-shortcuts-provider";
import type { ShortcutActionId } from "@/lib/keyboard-shortcuts/types";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type ShortcutBindingEditorProps = {
  actionId: ShortcutActionId;
  className?: string;
};

export function ShortcutBindingEditor({
  actionId,
  className,
}: ShortcutBindingEditorProps) {
  const { t } = useTranslation();
  const { getBinding, setBinding, resetBinding, settings } =
    useKeyboardShortcuts();
  const [isRecording, setIsRecording] = useState(false);
  const [conflictBinding, setConflictBinding] = useState<string | null>(null);

  const binding = getBinding(actionId);
  const defaultBinding = getDefaultBinding(actionId);

  const finishRecording = useCallback(
    (nextBinding: string | null) => {
      setIsRecording(false);
      setConflictBinding(null);

      if (!nextBinding) {
        return;
      }

      const normalized = normalizeBinding(nextBinding);
      if (!normalized) {
        setBinding(actionId, "");
        return;
      }

      const conflict = Object.entries(settings).find(
        ([id, existingBinding]) =>
          id !== actionId &&
          existingBinding &&
          bindingsConflict(existingBinding, normalized)
      );

      if (conflict) {
        setConflictBinding(normalized);
        return;
      }

      setBinding(actionId, normalized);
    },
    [actionId, setBinding, settings]
  );

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        finishRecording(null);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        finishRecording("");
        return;
      }

      const captured = eventToBinding(event);
      if (captured) {
        finishRecording(captured);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [finishRecording, isRecording]);

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div className="flex items-center gap-2">
        <ShortcutKeys binding={binding} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setConflictBinding(null);
            setIsRecording(true);
          }}
          aria-pressed={isRecording}
        >
          {isRecording
            ? t("settings.keyboardShortcuts.recording")
            : t("settings.keyboardShortcuts.change")}
        </Button>
        {binding !== defaultBinding ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => resetBinding(actionId)}
          >
            {t("settings.keyboardShortcuts.reset")}
          </Button>
        ) : null}
      </div>
      {conflictBinding ? (
        <p className="text-xs text-destructive">
          {t("settings.keyboardShortcuts.conflict")}
        </p>
      ) : null}
    </div>
  );
}
