export class PromptSendCancelledError extends Error {
  constructor() {
    super("Prompt send cancelled");
    this.name = "PromptSendCancelledError";
  }
}
