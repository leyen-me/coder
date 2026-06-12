import type { LabSettings } from "./types";

export const LAB_STORAGE_KEY = "coder:lab:settings";

/** @deprecated Migrated into {@link LAB_STORAGE_KEY}. */
export const LEGACY_PROMPT_REFINE_ENABLED_KEY = "coder:lab:prompt-refine-enabled";

export const DEFAULT_REFINE_PROMPT_SYSTEM_PROMPT = `You are a professional prompt optimization assistant. Your task is to rewrite the user's prompt to be clearer, more specific, and more professional, based on the original input and current conversation context, so an AI agent can understand and execute it better.

Rules:
1. Preserve the user's original intent
2. Fix grammar and wording to sound more professional
3. If the input is vague, add necessary details inferred from context
4. Output only the refined prompt with no explanation
5. Always write the refined prompt in the same language as the user's input
6. If the input is already clear and professional, make only minor edits or keep it unchanged`;

export const DEFAULT_LAB_SETTINGS: LabSettings = {
  promptRefineEnabled: false,
  promptRefineSystemPrompt: DEFAULT_REFINE_PROMPT_SYSTEM_PROMPT,
};
