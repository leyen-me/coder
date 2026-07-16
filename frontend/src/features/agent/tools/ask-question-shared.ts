export const ASK_QUESTION_OTHER_OPTION_ID = "__other__";

export type AskQuestionOption = {
  id: string;
  label: string;
  recommended?: boolean;
};

export type AskQuestionItem = {
  id: string;
  prompt: string;
  options: AskQuestionOption[];
  allow_multiple: boolean;
};

export type AskQuestionRequest = {
  title: string | null;
  timeout_ms: number | null;
  questions: AskQuestionItem[];
};

export type AskQuestionAnswer = {
  question_id: string;
  prompt: string;
  allow_multiple: boolean;
  selected_option_ids: string[];
  selected_option_labels: string[];
  other_text: string | null;
};

export type AskQuestionResponseResult =
  | {
      status: "answered";
      timedOut: false;
      answers: AskQuestionAnswer[];
    }
  | {
      status: "timeout";
      timedOut: true;
      timeoutMs: number;
      message: string;
      answers: [];
    };

export function parseAskQuestionRequest(
  rawArgs: unknown
): { ok: true; value: AskQuestionRequest } | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const rawTitle = record.title;
  const rawTimeoutMs = record.timeout_ms;
  const rawQuestions = record.questions;

  if (rawTitle !== undefined && typeof rawTitle !== "string") {
    return { ok: false, message: "title must be a string when provided" };
  }

  if (
    rawTimeoutMs !== undefined &&
    (!Number.isInteger(rawTimeoutMs) ||
      typeof rawTimeoutMs !== "number" ||
      rawTimeoutMs <= 0)
  ) {
    return {
      ok: false,
      message: "timeout_ms must be a positive integer when provided",
    };
  }

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return { ok: false, message: "questions must be a non-empty array" };
  }

  const questions: AskQuestionItem[] = [];
  const seenQuestionIds = new Set<string>();

  for (const [index, item] of rawQuestions.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, message: `questions[${index}] must be an object` };
    }

    const question = item as Record<string, unknown>;
    const id = question.id;
    const prompt = question.prompt;
    const options = question.options;
    const allowMultiple = question.allow_multiple;

    if (typeof id !== "string" || !id.trim()) {
      return { ok: false, message: `questions[${index}].id is required` };
    }

    const normalizedId = id.trim();
    if (seenQuestionIds.has(normalizedId)) {
      return { ok: false, message: `Duplicate question id: ${normalizedId}` };
    }
    seenQuestionIds.add(normalizedId);

    if (typeof prompt !== "string" || !prompt.trim()) {
      return { ok: false, message: `questions[${index}].prompt is required` };
    }

    if (!Array.isArray(options) || options.length < 2) {
      return {
        ok: false,
        message: `questions[${index}].options must include at least 2 choices`,
      };
    }

    if (allowMultiple !== undefined && typeof allowMultiple !== "boolean") {
      return {
        ok: false,
        message: `questions[${index}].allow_multiple must be a boolean`,
      };
    }

    const normalizedOptions: AskQuestionOption[] = [];
    const seenOptionIds = new Set<string>();

    for (const [optionIndex, optionItem] of options.entries()) {
      if (
        typeof optionItem !== "object" ||
        optionItem === null ||
        Array.isArray(optionItem)
      ) {
        return {
          ok: false,
          message: `questions[${index}].options[${optionIndex}] must be an object`,
        };
      }

      const option = optionItem as Record<string, unknown>;
      const optionId = option.id;
      const label = option.label;

      if (typeof optionId !== "string" || !optionId.trim()) {
        return {
          ok: false,
          message: `questions[${index}].options[${optionIndex}].id is required`,
        };
      }

      const normalizedOptionId = optionId.trim();
      if (normalizedOptionId === ASK_QUESTION_OTHER_OPTION_ID) {
        return {
          ok: false,
          message: `questions[${index}].options[${optionIndex}].id is reserved`,
        };
      }

      if (seenOptionIds.has(normalizedOptionId)) {
        return {
          ok: false,
          message: `Duplicate option id: ${normalizedOptionId}`,
        };
      }
      seenOptionIds.add(normalizedOptionId);

      if (typeof label !== "string" || !label.trim()) {
        return {
          ok: false,
          message: `questions[${index}].options[${optionIndex}].label is required`,
        };
      }

      const recommended = option.recommended;

      if (recommended !== undefined && typeof recommended !== "boolean") {
        return {
          ok: false,
          message: `questions[${index}].options[${optionIndex}].recommended must be a boolean`,
        };
      }

      normalizedOptions.push({
        id: normalizedOptionId,
        label: label.trim(),
        recommended: recommended ?? undefined,
      });
    }

    questions.push({
      id: normalizedId,
      prompt: prompt.trim(),
      options: normalizedOptions,
      allow_multiple: allowMultiple ?? false,
    });
  }

  return {
    ok: true,
    value: {
      title: typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : null,
      timeout_ms: typeof rawTimeoutMs === "number" ? rawTimeoutMs : null,
      questions,
    },
  };
}
