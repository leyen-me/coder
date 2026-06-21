import { ASK_QUESTION_TOOL_NAME } from "./definitions";

export type AskQuestionAnswerResult = {
  question_id: string;
  prompt: string;
  allow_multiple: boolean;
  selected_option_ids: string[];
  selected_option_labels: string[];
  other_text: string | null;
};

export type AskQuestionOutput = {
  title: string | null;
  questionCount: number;
  answers: AskQuestionAnswerResult[];
};

export function getAskQuestionChipLabel(
  toolName: string,
  output: unknown,
): string | null {
  if (toolName !== ASK_QUESTION_TOOL_NAME) {
    return null;
  }

  const data = extractAskQuestionOutput(output);
  if (!data) {
    return ASK_QUESTION_TOOL_NAME;
  }

  const titlePreview = data.title
    ? data.title.length > 40
      ? `${data.title.slice(0, 40)}…`
      : data.title
    : null;

  const answeredCount = data.answers.filter(
    (a) => a.selected_option_ids.length > 0 || a.other_text,
  ).length;

  if (titlePreview) {
    return `${ASK_QUESTION_TOOL_NAME}: ${titlePreview} (${answeredCount}/${data.questionCount})`;
  }

  return `${ASK_QUESTION_TOOL_NAME}: ${answeredCount}/${data.questionCount} answered`;
}

export function extractAskQuestionOutput(
  output: unknown,
): AskQuestionOutput | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.answers)) {
    return null;
  }

  return {
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : null,
    questionCount:
      typeof record.questionCount === "number" ? record.questionCount : 0,
    answers: record.answers as AskQuestionAnswerResult[],
  };
}

export function formatAskQuestionOutputForDisplay(
  output: unknown,
): AskQuestionOutput | null {
  return extractAskQuestionOutput(output);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
