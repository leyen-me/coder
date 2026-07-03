import { Badge } from "@/components/ui/badge";
import {
  formatContextWindow,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import { useLocale } from "@/lib/i18n/locale-provider";

type ModelCapabilityBadgesProps = {
  model: ModelDefinition;
  className?: string;
};

export function ModelCapabilityBadges({
  model,
  className,
}: ModelCapabilityBadgesProps) {
  const { t } = useLocale();

  return (
    <div className={className}>
      <Badge variant="outline">
        {t("settings.modelProvider.contextWindowBadge", {
          size: formatContextWindow(model.contextWindow),
        })}
      </Badge>
      {model.supportsThinking ? (
        <Badge variant="secondary">
          {t("settings.modelProvider.thinkingBadge")}
        </Badge>
      ) : null}
      {model.supportsMultimodal ? (
        <Badge variant="secondary">
          {t("settings.modelProvider.multimodalBadge")}
        </Badge>
      ) : null}
    </div>
  );
}
