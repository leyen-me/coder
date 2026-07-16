import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildFinalAnswerDecisionRequest,
  buildProxyContinuationUserMessage,
} from "./decision/policy";
import {
  buildProxyDecisionUserPrompt,
  PROXY_DECISION_SYSTEM_PROMPT,
} from "./decision/prompt";
import {
  extractJsonObject,
  normalizeDecisionResponse,
} from "./decision/runner";
import { isLongTaskSession } from "./session-policy";

type Fixture = {
  name: string;
  input: {
    sessionId: string;
    taskId: string;
    assistantResponse: string;
    sessionKind: "standard" | "long_task";
    autonomyMode: "interactive" | "unattended";
    decisionPolicyVersion: string;
    decisionResponseContent: string;
  };
  expected: {
    shouldRequestProxyDecision?: boolean;
    finalAnswerDecisionRequest?: unknown;
    proxyDecisionSystemPrompt?: string;
    proxyDecisionUserPromptObject?: unknown;
    normalizedDecisionResponse?: unknown;
    proxyContinuationUserMessage?: unknown;
  };
};

const FIXTURE_DIR = path.resolve(
  __dirname,
  "../../../../testdata/unattended-decision"
);

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) =>
      JSON.parse(
        readFileSync(path.join(FIXTURE_DIR, file), "utf8")
      ) as Fixture
    );
}

describe("unattended decision shared fixtures", () => {
  for (const fixture of loadFixtures()) {
    it(`matches frontend oracle for ${fixture.name}`, () => {
      const { input, expected } = fixture;

      if (expected.shouldRequestProxyDecision !== undefined) {
        expect(
          isLongTaskSession({
            sessionKind: input.sessionKind,
            autonomyMode: input.autonomyMode,
          })
        ).toBe(expected.shouldRequestProxyDecision);
      }

      const request = buildFinalAnswerDecisionRequest({
        sessionId: input.sessionId,
        taskId: input.taskId,
        assistantResponse: input.assistantResponse,
        sessionKind: input.sessionKind,
        autonomyMode: input.autonomyMode,
        decisionPolicyVersion: input.decisionPolicyVersion,
      });

      if (expected.finalAnswerDecisionRequest) {
        expect(request).toEqual(expected.finalAnswerDecisionRequest);
      }

      if (expected.proxyDecisionSystemPrompt) {
        expect(PROXY_DECISION_SYSTEM_PROMPT).toBe(
          expected.proxyDecisionSystemPrompt
        );
      }

      if (expected.proxyDecisionUserPromptObject) {
        expect(JSON.parse(buildProxyDecisionUserPrompt(request))).toEqual(
          expected.proxyDecisionUserPromptObject
        );
      }

      const normalizedResponse = normalizeDecisionResponse(
        JSON.parse(extractJsonObject(input.decisionResponseContent))
      );

      if (expected.normalizedDecisionResponse) {
        expect(normalizedResponse).toEqual(expected.normalizedDecisionResponse);
      }

      if (expected.proxyContinuationUserMessage) {
        expect(buildProxyContinuationUserMessage(normalizedResponse)).toEqual(
          expected.proxyContinuationUserMessage
        );
      }
    });
  }
});
