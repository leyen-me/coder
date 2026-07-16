import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAgentHandoffUserPrompt,
  buildContinuationPrompt,
  buildFallbackHandoffBody,
  buildStoredHandoffArtifact,
  buildVerificationChecklist,
  deriveContinuationSessionTitle,
} from "./handoff";

type HandoffFixture = {
  name: string;
  input: {
    sourceSessionId: string;
    continuedSessionId: string;
    sourceSessionTitle: string;
    generatedAt: string;
    model: string;
    sessionKind: "standard" | "long_task";
    autonomyMode: "interactive" | "unattended";
    decisionPolicyVersion: string;
    decisionModel: string | null;
    contextUsage: {
      usedTokens: number;
      maxTokens: number;
      remainingTokens: number;
      reservedTokens: number;
      triggerThreshold: number;
    };
    handoffBody: string;
    qualityFailures?: string[];
    supplementalContext?: Parameters<typeof buildStoredHandoffArtifact>[0]["supplementalContext"];
    fallbackUserContent: string;
  };
  expected: {
    handoffUserPrompt?: string;
    verificationChecklist?: string[];
    continuationTitle?: string;
    fallbackHandoffBody?: string;
    storedHandoffArtifact?: string;
    continuationPrompt?: string;
  };
};

const FIXTURE_DIR = path.resolve(
  __dirname,
  "../../../../testdata/handoff"
);

function loadFixtures(): HandoffFixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) =>
      JSON.parse(
        readFileSync(path.join(FIXTURE_DIR, file), "utf8")
      ) as HandoffFixture
    );
}

describe("handoff shared fixtures", () => {
  for (const fixture of loadFixtures()) {
    it(`matches frontend oracle for ${fixture.name}`, () => {
      const { input, expected } = fixture;

      if (expected.handoffUserPrompt) {
        expect(
          buildAgentHandoffUserPrompt({
            sessionTitle: input.sourceSessionTitle,
            contextUsage: input.contextUsage,
            sessionKind: input.sessionKind,
            autonomyMode: input.autonomyMode,
            decisionPolicyVersion: input.decisionPolicyVersion,
            decisionModel: input.decisionModel,
            qualityFailures: input.qualityFailures,
          })
        ).toBe(expected.handoffUserPrompt);
      }

      if (expected.verificationChecklist) {
        expect(
          buildVerificationChecklist({
            verification: input.supplementalContext?.verification ?? null,
            workingSet: input.supplementalContext?.workingSet ?? [],
            backgroundJobs: input.supplementalContext?.backgroundJobs ?? [],
          })
        ).toEqual(expected.verificationChecklist);
      }

      if (expected.continuationTitle) {
        expect(deriveContinuationSessionTitle(input.sourceSessionTitle)).toBe(
          expected.continuationTitle
        );
      }

      if (expected.fallbackHandoffBody) {
        expect(
          buildFallbackHandoffBody({
            userContent: input.fallbackUserContent,
            sourceSessionTitle: input.sourceSessionTitle,
          })
        ).toBe(expected.fallbackHandoffBody);
      }

      if (expected.storedHandoffArtifact) {
        expect(
          buildStoredHandoffArtifact({
            sourceSessionId: input.sourceSessionId,
            continuedSessionId: input.continuedSessionId,
            sourceSessionTitle: input.sourceSessionTitle,
            generatedAt: input.generatedAt,
            model: input.model,
            contextUsage: input.contextUsage,
            sessionKind: input.sessionKind,
            autonomyMode: input.autonomyMode,
            decisionPolicyVersion: input.decisionPolicyVersion,
            decisionModel: input.decisionModel,
            handoffBody: input.handoffBody,
            supplementalContext: input.supplementalContext ?? null,
          })
        ).toBe(expected.storedHandoffArtifact);
      }

      if (expected.continuationPrompt) {
        const verificationChecklist =
          expected.verificationChecklist ??
          buildVerificationChecklist({
            verification: input.supplementalContext?.verification ?? null,
            workingSet: input.supplementalContext?.workingSet ?? [],
            backgroundJobs: input.supplementalContext?.backgroundJobs ?? [],
          });

        expect(
          buildContinuationPrompt({
            handoffArtifact: expected.storedHandoffArtifact!,
            sourceSessionTitle: input.sourceSessionTitle,
            sessionKind: input.sessionKind,
            autonomyMode: input.autonomyMode,
            decisionPolicyVersion: input.decisionPolicyVersion,
            workingSet: input.supplementalContext?.workingSet ?? [],
            verificationChecklist,
            toolArchiveIndexPath:
              input.supplementalContext?.toolArchiveIndexPath ?? null,
            historyFilePath:
              input.supplementalContext?.historyFilePath ?? null,
            chainManifestPath:
              input.supplementalContext?.chainManifestPath ?? null,
          })
        ).toBe(expected.continuationPrompt);
      }
    });
  }
});
