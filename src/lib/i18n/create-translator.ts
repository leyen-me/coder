import { formatMessage } from "./format-message";
import type { MessageKey, Messages } from "./messages";

function getMessageByPath(messages: Messages, path: string): string {
  const segments = path.split(".");
  let current: unknown = messages;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return path;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" ? current : path;
}

export function createTranslator(messages: Messages) {
  return function translate(
    key: MessageKey,
    params?: Record<string, string | number>
  ): string {
    return formatMessage(getMessageByPath(messages, key), params);
  };
}

export { getMessageByPath };
