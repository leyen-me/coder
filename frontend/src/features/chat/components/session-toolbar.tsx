import { ProviderUsageTag } from "@/features/lab/provider-usage-tag";
import type { ProviderId } from "@/lib/model-provider/types";

type SessionToolbarProps = {
  sessionProvider?: ProviderId | null;
  sessionId?: string | null;
};

export function SessionToolbar({ sessionProvider, sessionId: _sessionId }: SessionToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ProviderUsageTag providerId={sessionProvider} />
    </div>
  );
}
