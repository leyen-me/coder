"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { DecisionOutcome, DecisionRiskLevel } from "@/lib/decision";
import { BotIcon } from "lucide-react";

type DecisionEventCardProps = {
  summary: string;
  question: string;
  status: "requested" | "resolved";
  riskLevel: DecisionRiskLevel;
  outcome?: DecisionOutcome | null;
  reason?: string | null;
  assumption?: string | null;
  requiresUserConfirmation: boolean;
};

export function DecisionEventCard({
  summary,
  question,
  status,
  riskLevel,
  outcome,
  reason,
  assumption,
  requiresUserConfirmation,
}: DecisionEventCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="w-full rounded-2xl border border-primary/20 shadow-xs" size="sm">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <BotIcon className="size-4 text-primary" />
          <CardTitle>{t("chat.decisionTitle")}</CardTitle>
        </div>
        <CardDescription>{t("chat.decisionDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {status === "resolved"
              ? t("chat.decisionStatusResolved")
              : t("chat.decisionStatusRequested")}
          </Badge>
          <Badge variant={riskLevel === "high" ? "destructive" : "outline"}>
            {riskLevel === "high"
              ? t("chat.decisionRiskHigh")
              : riskLevel === "medium"
                ? t("chat.decisionRiskMedium")
                : t("chat.decisionRiskLow")}
          </Badge>
          {outcome ? (
            <Badge variant="outline">
              {outcome === "continue"
                ? t("chat.decisionOutcomeContinue")
                : outcome === "complete"
                  ? t("chat.decisionOutcomeComplete")
                : outcome === "ask_user"
                  ? t("chat.decisionOutcomeAskUser")
                  : t("chat.decisionOutcomeStopPath")}
            </Badge>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="font-medium text-sm">{summary}</p>
          <p className="whitespace-pre-wrap text-muted-foreground text-sm">
            {question}
          </p>
        </div>

        {reason ? (
          <div className="space-y-1">
            <p className="font-medium text-sm">{t("chat.decisionReason")}</p>
            <p className="whitespace-pre-wrap text-muted-foreground text-sm">
              {reason}
            </p>
          </div>
        ) : null}

        {assumption ? (
          <div className="space-y-1">
            <p className="font-medium text-sm">{t("chat.decisionAssumption")}</p>
            <p className="whitespace-pre-wrap text-muted-foreground text-sm">
              {assumption}
            </p>
          </div>
        ) : null}

        {requiresUserConfirmation ? (
          <p className="text-destructive text-sm">
            {t("chat.decisionRequiresUserConfirmation")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
