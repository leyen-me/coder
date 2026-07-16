import { ASK_QUESTION_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import {
  parseAskQuestionRequest,
  type AskQuestionAnswer,
} from "./ask-question-shared";
import { requestAskQuestionResponse } from "./ask-question-session";

const DEFAULT_ASK_QUESTION_TIMEOUT_MS = 30_000;

export const askQuestionHandler: ToolHandler = async (rawArgs, context) => {
  const taskId = context.taskId?.trim();
  if (!taskId) {
    return toolFailure(
      ASK_QUESTION_TOOL_NAME,
      "missing_task",
      "ask_question requires an active task"
    );
  }

  const parsed = parseAskQuestionRequest(rawArgs);
  if (!parsed.ok) {
    return toolFailure(ASK_QUESTION_TOOL_NAME, "invalid_arguments", parsed.message);
  }

  const response = await requestAskQuestionResponse(
    {
      ...parsed.value,
      taskId,
      sessionId: context.sessionId?.trim() || null,
    },
    context.signal,
    parsed.value.timeout_ms ?? DEFAULT_ASK_QUESTION_TIMEOUT_MS
  );

  if (response.status === "timeout") {
    return toolSuccess(ASK_QUESTION_TOOL_NAME, {
      title: parsed.value.title,
      questionCount: parsed.value.questions.length,
      status: "timeout",
      timedOut: true,
      timeoutMs: response.timeoutMs,
      message: response.message,
      answers: [],
    });
  }

  return toolSuccess(ASK_QUESTION_TOOL_NAME, {
    title: parsed.value.title,
    questionCount: parsed.value.questions.length,
    status: "answered",
    timedOut: false,
    answers: normalizeAskQuestionAnswers(response.answers),
  });
};

function normalizeAskQuestionAnswers(answers: AskQuestionAnswer[]) {
  return answers.map((answer) => ({
    question_id: answer.question_id,
    prompt: answer.prompt,
    allow_multiple: answer.allow_multiple,
    selected_option_ids: [...answer.selected_option_ids],
    selected_option_labels: [...answer.selected_option_labels],
    other_text: answer.other_text,
  }));
}
