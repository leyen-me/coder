import { describe, expect, it } from "vitest";

import { chatCompletionsUrl } from "@/features/agent/openai-url";
import {
  readLastSelectedModel,
  resolveDefaultModel,
  writeLastSelectedModel,
} from "@/features/agent/model-preference";
import { createModelDefinition } from "@/lib/model-provider/model-definition";

describe("chatCompletionsUrl", () => {
  it("appends /v1/chat/completions when base url has no /v1 suffix", () => {
    expect(chatCompletionsUrl("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/v1/chat/completions"
    );
  });

  it("appends /chat/completions when base url already ends with /v1", () => {
    expect(chatCompletionsUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1/chat/completions"
    );
  });
});

describe("model preference", () => {
  it("remembers last selected model when still available", () => {
    writeLastSelectedModel("glm-5");
    expect(readLastSelectedModel()).toBe("glm-5");
    expect(
      resolveDefaultModel({
        models: [
          createModelDefinition("glm-5"),
          createModelDefinition("glm-4.7"),
        ],
      })
    ).toBe("glm-5");
  });
});
