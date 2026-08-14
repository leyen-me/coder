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
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_ASK_QUESTION_TIMEOUT_MS,
  parseAskQuestionRequest,
  type AskQuestionAnswer,
  type AskQuestionItem,
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
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const autoSubmitTimerRef = useRef<number | null>(null);
  const buildPartialAnswersRef = useRef<() => AskQuestionAnswer[]>(() => []);

  useEffect(() => {
    setSingleSelections({});
    setMultiSelections({});
    setOtherTexts({});
    setErrors({});
    setSubmitError(null);
    setIsSubmitting(false);
    setAutoSubmitted(false);
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

  // 单选下，输入自定义答案会取消已选选项，保证两项互斥。
  const setOtherText = (questionId: string, value: string, allowMultiple: boolean) => {
    setOtherTexts((current) => ({ ...current, [questionId]: value }));
    if (!allowMultiple && value.trim().length > 0) {
      setSingleSelections((current) => {
        if (!current[questionId]) {
          return current;
        }
        const next = { ...current };
        delete next[questionId];
        return next;
      });
    }
  };

  const selectedIdsForQuestion = (question: AskQuestionItem): string[] =>
    question.allow_multiple
      ? (multiSelections[question.id] ?? [])
      : singleSelections[question.id]
        ? [singleSelections[question.id]]
        : [];

  const answerForQuestion = (
    question: AskQuestionItem,
    selectedOptionIds: string[],
    otherText: string
  ): AskQuestionAnswer => ({
    question_id: question.id,
    prompt: question.prompt,
    allow_multiple: question.allow_multiple,
    selected_option_ids: selectedOptionIds,
    selected_option_labels: selectedOptionIds
      .map((optionId) => question.options.find((option) => option.id === optionId)?.label)
      .filter((label): label is string => Boolean(label)),
    other_text: otherText || null,
  });

  // 超时兜底只提交已经回答的问题，未回答的保持未答。
  buildPartialAnswersRef.current = () => {
    if (!request) {
      return [];
    }

    const answers: AskQuestionAnswer[] = [];
    for (const question of request.questions) {
      const otherText = otherTexts[question.id]?.trim() ?? "";
      const selectedOptionIds = selectedIdsForQuestion(question);
      if (selectedOptionIds.length === 0 && !otherText) {
        continue;
      }
      answers.push(answerForQuestion(question, selectedOptionIds, otherText));
    }
    return answers;
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
      const selectedOptionIds = selectedIdsForQuestion(question);

      if (selectedOptionIds.length === 0 && !otherText) {
        nextErrors[question.id] = t("chat.askQuestionSelectRequired");
        continue;
      }

      answers.push(answerForQuestion(question, selectedOptionIds, otherText));
    }

    if (Object.keys(nextErrors).length > 0) {
      return { ok: false, errors: nextErrors };
    }

    return { ok: true, answers };
  };

  const clearAutoSubmitTimer = () => {
    if (autoSubmitTimerRef.current !== null) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!taskId || !request || invocation.output || invocation.errorText) {
      return;
    }

    const timeoutMs = request.timeout_ms ?? DEFAULT_ASK_QUESTION_TIMEOUT_MS;
    const leadMs = Math.min(2_000, Math.max(0, timeoutMs - 250));
    autoSubmitTimerRef.current = window.setTimeout(() => {
      autoSubmitTimerRef.current = null;
      const answers = buildPartialAnswersRef.current();
      if (answers.length === 0) {
        return;
      }

      setAutoSubmitted(true);
      setSubmitError(null);
      const submitted = submitAskQuestionResponse(taskId, answers);
      if (submitted) {
        return;
      }

      apiPost("/api/agent/ask_question/respond", {
        taskId,
        answers,
      }).catch(() => {
        setSubmitError(t("chat.askQuestionSubmitError"));
      });
    }, Math.max(0, timeoutMs - leadMs));

    return () => {
      clearAutoSubmitTimer();
    };
  }, [invocation.errorText, invocation.id, invocation.output, request, taskId, t]);

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
      clearAutoSubmitTimer();
      setAutoSubmitted(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await apiPost("/api/agent/ask_question/respond", {
        taskId,
        answers: built.answers,
      });
      clearAutoSubmitTimer();
      setAutoSubmitted(true);
      setIsSubmitting(false);
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
                          disabled={autoSubmitted}
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
                </div>
              ) : (
                <RadioGroup
                  disabled={autoSubmitted}
                  onValueChange={(value) => {
                    setSingleSelections((current) => ({
                      ...current,
                      [question.id]: value,
                    }));
                    // 单选选中预设选项时清空自定义答案。
                    setOtherTexts((current) => ({ ...current, [question.id]: "" }));
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
                </RadioGroup>
              )}

              {/* 常驻输入框，直接填写即作为自定义答案，无需先选择“其他”。 */}
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("chat.askQuestionOtherLabel")}
                </div>
                <Textarea
                  disabled={autoSubmitted}
                  onChange={(event) => {
                    setOtherText(question.id, event.target.value, question.allow_multiple);
                  }}
                  placeholder={t("chat.askQuestionOtherPlaceholder")}
                  value={otherTexts[question.id] ?? ""}
                />
              </div>

              {errors[question.id] ? (
                <div className="text-destructive text-xs">{errors[question.id]}</div>
              ) : null}
            </div>
          );
        })}

        {submitError ? (
          <div className="text-destructive text-xs">{submitError}</div>
        ) : null}
        {autoSubmitted ? (
          <div className="text-muted-foreground text-xs">
            {t("chat.askQuestionAutoSubmitted")}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            disabled={isSubmitting || autoSubmitted}
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            {t("chat.askQuestionSubmit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
