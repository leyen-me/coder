"use client";

import { apiPost } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { MessageToolInvocation } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { CircleHelpIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  ASK_QUESTION_OTHER_OPTION_ID,
  parseAskQuestionRequest,
  type AskQuestionAnswer,
} from "@/features/agent/tools/ask-question-shared";
import {
  submitAskQuestionResponse,
  usePendingAskQuestionRequest,
} from "@/features/agent/tools/ask-question-session";

type AskQuestionToolCardProps = {
  invocation: MessageToolInvocation;
  taskId: string | null;
};

type QuestionErrors = Record<string, string | null>;

export function AskQuestionToolCard({
  invocation,
  taskId,
}: AskQuestionToolCardProps) {
  const { t } = useTranslation();
  const pendingRequest = usePendingAskQuestionRequest(taskId);
  const parsedRequest = useMemo(
    () => parseAskQuestionRequest(invocation.input),
    [invocation.input]
  );
  const request =
    pendingRequest && parsedRequest.ok ? pendingRequest : parsedRequest.ok ? parsedRequest.value : null;

  const [singleSelections, setSingleSelections] = useState<Record<string, string>>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<QuestionErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSingleSelections({});
    setMultiSelections({});
    setOtherTexts({});
    setErrors({});
    setSubmitError(null);
    setIsSubmitting(false);
  }, [invocation.id, request?.title, taskId]);

  if (!taskId || !request) {
    return null;
  }

  const toggleMultiOption = (questionId: string, optionId: string, checked: boolean) => {
    setMultiSelections((current) => {
      const selected = new Set(current[questionId] ?? []);
      if (checked) {
        selected.add(optionId);
      } else {
        selected.delete(optionId);
      }
      return { ...current, [questionId]: [...selected] };
    });
  };

  const setOtherText = (questionId: string, value: string, allowMultiple: boolean) => {
    setOtherTexts((current) => ({ ...current, [questionId]: value }));
    if (allowMultiple) {
      toggleMultiOption(questionId, ASK_QUESTION_OTHER_OPTION_ID, value.trim().length > 0);
    }
  };

  const buildAnswers = (): {
    ok: true;
    answers: AskQuestionAnswer[];
  } | {
    ok: false;
    errors: QuestionErrors;
  } => {
    const nextErrors: QuestionErrors = {};
    const answers: AskQuestionAnswer[] = [];

    for (const question of request.questions) {
      const otherText = otherTexts[question.id]?.trim() ?? "";
      const selectedOptionIds = question.allow_multiple
        ? (multiSelections[question.id] ?? []).filter(
            (optionId) => optionId !== ASK_QUESTION_OTHER_OPTION_ID
          )
        : (() => {
            const selected = singleSelections[question.id];
            if (!selected || selected === ASK_QUESTION_OTHER_OPTION_ID) {
              return [];
            }
            return [selected];
          })();
      const selectedOptionLabels = selectedOptionIds
        .map((optionId) => question.options.find((option) => option.id === optionId)?.label)
        .filter((label): label is string => Boolean(label));

      const otherSelected = question.allow_multiple
        ? (multiSelections[question.id] ?? []).includes(ASK_QUESTION_OTHER_OPTION_ID)
        : singleSelections[question.id] === ASK_QUESTION_OTHER_OPTION_ID;

      if (otherSelected && !otherText) {
        nextErrors[question.id] = t("chat.askQuestionOtherRequired");
        continue;
      }

      if (selectedOptionIds.length === 0 && !otherText) {
        nextErrors[question.id] = t("chat.askQuestionSelectRequired");
        continue;
      }

      answers.push({
        question_id: question.id,
        prompt: question.prompt,
        allow_multiple: question.allow_multiple,
        selected_option_ids: selectedOptionIds,
        selected_option_labels: selectedOptionLabels,
        other_text: otherText || null,
      });
    }

    if (Object.keys(nextErrors).length > 0) {
      return { ok: false, errors: nextErrors };
    }

    return { ok: true, answers };
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    const built = buildAnswers();
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    const submitted = submitAskQuestionResponse(taskId, built.answers);
    if (submitted) {
      return;
    }

    try {
      await apiPost("/api/agent/ask_question/respond", {
        taskId,
        answers: built.answers,
      });
    } catch {
      setIsSubmitting(false);
      setSubmitError(t("chat.askQuestionSubmitError"));
    }
  };

  return (
    <Card className="w-full rounded-2xl border border-primary/20 shadow-xs" size="sm">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <CircleHelpIcon className="size-4 text-primary" />
          <CardTitle>{request.title ?? t("chat.askQuestionTitle")}</CardTitle>
        </div>
        <CardDescription>{t("chat.askQuestionDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-1">
        {request.questions.map((question) => {
          const otherSelected = question.allow_multiple
            ? (multiSelections[question.id] ?? []).includes(ASK_QUESTION_OTHER_OPTION_ID)
            : singleSelections[question.id] === ASK_QUESTION_OTHER_OPTION_ID;

          return (
            <div className="space-y-3" key={question.id}>
              <div className="space-y-1">
                <div className="font-medium text-sm">{question.prompt}</div>
                <div className="text-muted-foreground text-xs">
                  {question.allow_multiple
                    ? t("chat.askQuestionMultiple")
                    : t("chat.askQuestionSingle")}
                </div>
              </div>

              {question.allow_multiple ? (
                <div className="space-y-2">
                  {question.options.map((option) => {
                    const checked = (multiSelections[question.id] ?? []).includes(option.id);
                    return (
                      <label
                        className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                        key={option.id}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            toggleMultiOption(question.id, option.id, value === true);
                          }}
                        />
                        <div className="flex items-center gap-1.5">
                          <span>{option.label}</span>
                          {option.recommended ? (
                            <Badge className="text-[10px] leading-none" variant="secondary">
                              推荐
                            </Badge>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                  <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                    <Checkbox
                      checked={otherSelected}
                      onCheckedChange={(value) => {
                        toggleMultiOption(
                          question.id,
                          ASK_QUESTION_OTHER_OPTION_ID,
                          value === true
                        );
                        if (value !== true) {
                          setOtherTexts((current) => ({ ...current, [question.id]: "" }));
                        }
                      }}
                    />
                    <span>{t("chat.askQuestionOther")}</span>
                  </label>
                </div>
              ) : (
                <RadioGroup
                  onValueChange={(value) => {
                    setSingleSelections((current) => ({
                      ...current,
                      [question.id]: value,
                    }));
                    if (value !== ASK_QUESTION_OTHER_OPTION_ID) {
                      setOtherTexts((current) => ({ ...current, [question.id]: "" }));
                    }
                  }}
                  value={singleSelections[question.id] ?? ""}
                >
                  {question.options.map((option) => (
                    <label
                      className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                      key={option.id}
                    >
                      <RadioGroupItem value={option.id} />
                      <div className="flex items-center gap-1.5">
                        <span>{option.label}</span>
                        {option.recommended ? (
                          <Badge className="text-[10px] leading-none" variant="secondary">
                            推荐
                          </Badge>
                        ) : null}
                      </div>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                    <RadioGroupItem value={ASK_QUESTION_OTHER_OPTION_ID} />
                    <span>{t("chat.askQuestionOther")}</span>
                  </label>
                </RadioGroup>
              )}

              {otherSelected ? (
                <Textarea
                  onChange={(event) => {
                    setOtherText(question.id, event.target.value, question.allow_multiple);
                  }}
                  placeholder={t("chat.askQuestionOtherPlaceholder")}
                  value={otherTexts[question.id] ?? ""}
                />
              ) : null}

              {errors[question.id] ? (
                <div className="text-destructive text-xs">{errors[question.id]}</div>
              ) : null}
            </div>
          );
        })}

        {submitError ? (
          <div className="text-destructive text-xs">{submitError}</div>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={isSubmitting} onClick={handleSubmit} size="sm" type="button">
            {t("chat.askQuestionSubmit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
