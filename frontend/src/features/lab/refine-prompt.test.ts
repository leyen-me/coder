import { describe, expect, it, vi } from "vitest";

import { apiPost } from "@/lib/api/client";

import { refinePrompt } from "./refine-prompt";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

vi.mock("./storage", () => ({
  resolvePromptRefineSystemPrompt: () => "Refine system prompt",
}));

vi.mock("./lab-settings-store", () => ({
  getLabSettingsSnapshot: () => ({}),
}));

describe("refinePrompt", () => {
  it("calls the server refine_prompt endpoint without a client-side api key", async () => {
    vi.mocked(apiPost).mockResolvedValue("Refined prompt");

    const result = await refinePrompt({
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      apiKeySource: "env",
      apiKeyEnvVar: "OPENAI_API_KEY",
      model: "gpt-4.1",
      userPrompt: "Make this clearer",
    });

    expect(apiPost).toHaveBeenCalledWith(
      "/agent/refine_prompt",
      {
        baseUrl: "https://api.example.com/v1",
        apiKey: null,
        apiKeySource: "env",
        apiKeyEnvVar: "OPENAI_API_KEY",
        model: "gpt-4.1",
        userPrompt: "Make this clearer",
        systemPrompt: "Refine system prompt",
        contextMessages: [],
      },
      undefined
    );
    expect(result).toBe("Refined prompt");
  });
});
