import { describe, expect, it, vi } from "vitest";

import { ASK_QUESTION_TOOL_NAME } from "./definitions";
import { askQuestionHandler } from "./ask-question";
import { toolFailure, toolSuccess } from "./result";

vi.mock("./ask-question-session", () => ({
  requestAskQuestionResponse: vi.fn(),
}));

import { requestAskQuestionResponse } from "./ask-question-session";

describe("askQuestionHandler", () => {
  it("requires an active task", async () => {
    const result = await askQuestionHandler(
      {
        questions: [
          {
            id: "one",
            prompt: "Choose one",
            options: [
              { id: "a", label: "A" },
              { id: "b", label: "B" },
            ],
          },
        ],
      },
      { workspaceDir: "/tmp/project", taskId: undefined }
    );

    expect(result).toEqual(
      toolFailure(
        ASK_QUESTION_TOOL_NAME,
        "missing_task",
        "ask_question requires an active task"
      )
    );
  });

  it("validates question payloads", async () => {
    const result = await askQuestionHandler(
      {
        questions: [
          {
            id: "one",
            prompt: "Choose one",
            options: [{ id: "a", label: "A" }],
          },
        ],
      },
      { workspaceDir: "/tmp/project", taskId: "task-1" }
    );

    expect(result).toEqual(
      toolFailure(
        ASK_QUESTION_TOOL_NAME,
        "invalid_arguments",
        "questions[0].options must include at least 2 choices"
      )
    );
  });

  it("returns answers after the user responds", async () => {
    vi.mocked(requestAskQuestionResponse).mockResolvedValueOnce({
      status: "answered",
      timedOut: false,
      answers: [
        {
          question_id: "stack",
          prompt: "Which stack?",
          allow_multiple: false,
          selected_option_ids: ["react"],
          selected_option_labels: ["React"],
          other_text: null,
        },
      ],
    });

    const result = await askQuestionHandler(
      {
        title: "Clarify stack",
        questions: [
          {
            id: "stack",
            prompt: "Which stack?",
            options: [
              { id: "react", label: "React" },
              { id: "vue", label: "Vue" },
            ],
          },
        ],
      },
      { workspaceDir: "/tmp/project", taskId: "task-1", sessionId: "session-1" }
    );

    expect(requestAskQuestionResponse).toHaveBeenCalledWith(
      {
        title: "Clarify stack",
        timeout_ms: null,
        taskId: "task-1",
        sessionId: "session-1",
        questions: [
          {
            id: "stack",
            prompt: "Which stack?",
            allow_multiple: false,
            options: [
              { id: "react", label: "React" },
              { id: "vue", label: "Vue" },
            ],
          },
        ],
      },
      undefined,
      30000
    );
    expect(result).toEqual(
      toolSuccess(ASK_QUESTION_TOOL_NAME, {
        title: "Clarify stack",
        questionCount: 1,
        status: "answered",
        timedOut: false,
        answers: [
          {
            question_id: "stack",
            prompt: "Which stack?",
            allow_multiple: false,
            selected_option_ids: ["react"],
            selected_option_labels: ["React"],
            other_text: null,
          },
        ],
      })
    );
  });

  it("returns a timeout result instead of failing", async () => {
    vi.mocked(requestAskQuestionResponse).mockResolvedValueOnce({
      status: "timeout",
      timedOut: true,
      timeoutMs: 30_000,
      message:
        "User did not respond before timeout and may be away from the computer.",
      answers: [],
    });

    const result = await askQuestionHandler(
      {
        title: "Clarify stack",
        timeout_ms: 30000,
        questions: [
          {
            id: "stack",
            prompt: "Which stack?",
            options: [
              { id: "react", label: "React" },
              { id: "vue", label: "Vue" },
            ],
          },
        ],
      },
      { workspaceDir: "/tmp/project", taskId: "task-1", sessionId: "session-1" }
    );

    expect(requestAskQuestionResponse).toHaveBeenCalledWith(
      {
        title: "Clarify stack",
        timeout_ms: 30000,
        taskId: "task-1",
        sessionId: "session-1",
        questions: [
          {
            id: "stack",
            prompt: "Which stack?",
            allow_multiple: false,
            options: [
              { id: "react", label: "React" },
              { id: "vue", label: "Vue" },
            ],
          },
        ],
      },
      undefined,
      30000
    );
    expect(result).toEqual(
      toolSuccess(ASK_QUESTION_TOOL_NAME, {
        title: "Clarify stack",
        questionCount: 1,
        status: "timeout",
        timedOut: true,
        timeoutMs: 30000,
        message:
          "User did not respond before timeout and may be away from the computer.",
        answers: [],
      })
    );
  });
});
