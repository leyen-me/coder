import { Button } from "@/components/ui/button";
import { ShortcutKeys } from "@/features/keyboard-shortcuts/shortcut-keys";
import {
  AGENT_STOP_CONFIRM_TIMEOUT_MS,
} from "@/features/chat/hooks/use-agent-stop-confirmation";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts/keyboard-shortcuts-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";

type AgentStopConfirmBannerProps = {
  onConfirm: () => void;
  onDismiss: () => void;
};

export function AgentStopConfirmBanner({
  onConfirm,
  onDismiss,
}: AgentStopConfirmBannerProps) {
  const { t } = useTranslation();
  const { getBinding } = useKeyboardShortcuts();
  const cancelBinding = getBinding("chat.cancel");

  return (
    <div
      className="mb-2 overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 dark:bg-destructive/10"
      role="status"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-foreground">
          {t("chat.stopAgentConfirm")}
        </p>
        <ShortcutKeys binding={cancelBinding} />
        <Button
          className="h-7 shrink-0 px-2.5 text-xs"
          onClick={onConfirm}
          size="sm"
          type="button"
          variant="destructive"
        >
          {t("chat.stopAgentConfirmAction")}
        </Button>
        <Button
          className="h-7 shrink-0 px-2.5 text-xs"
          onClick={onDismiss}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("chat.stopAgentConfirmDismiss")}
        </Button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-left rounded-full bg-destructive/70"
          style={{
            animation: `agent-stop-confirm-shrink ${AGENT_STOP_CONFIRM_TIMEOUT_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}
