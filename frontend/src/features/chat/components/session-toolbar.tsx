import { FolderOpenIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { TitleBarNavButton } from "@/components/layout/title-bar-nav-button";
import { ProviderUsageTag } from "@/features/lab/provider-usage-tag";
import { openWorkspaceInExplorer } from "@/features/workspace/open-workspace-in-explorer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { ProviderId } from "@/lib/model-provider/types";

type SessionToolbarProps = {
  sessionProvider?: ProviderId | null;
  workspaceDir?: string | null;
};

export function SessionToolbar({
  sessionProvider,
  workspaceDir,
}: SessionToolbarProps) {
  const { t } = useTranslation();
  const hasWorkspace = Boolean(workspaceDir?.trim());

  const handleOpenInExplorer = useCallback(() => {
    const path = workspaceDir?.trim();
    if (!path) {
      return;
    }

    void (async () => {
      const result = await openWorkspaceInExplorer(path);
      if (result.ok) {
        return;
      }
      toast.error(result.message || t("session.openWorkspaceInExplorerFailed"));
    })();
  }, [t, workspaceDir]);

  return (
    <div className="flex min-w-0 shrink items-center gap-0.5 sm:gap-1">
      {hasWorkspace ? (
        <div className="hidden sm:block">
          <TitleBarNavButton
            icon={FolderOpenIcon}
            label={t("session.openWorkspaceInExplorer")}
            onClick={handleOpenInExplorer}
          />
        </div>
      ) : null}
      <div className="hidden sm:block">
        <ProviderUsageTag providerId={sessionProvider} />
      </div>
    </div>
  );
}
