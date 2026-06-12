const PROMPT_REFINE_KEY = "coder:lab:prompt-refine-enabled";

export function readPromptRefineEnabled(): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }

  try {
    return localStorage.getItem(PROMPT_REFINE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writePromptRefineEnabled(enabled: boolean): void {
  localStorage.setItem(PROMPT_REFINE_KEY, String(enabled));
}
