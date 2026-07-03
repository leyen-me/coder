const ANSI_ESCAPE_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/** Removes ANSI escape sequences so terminal output reads cleanly in plain text UI. */
export function stripAnsi(text: string): string {
  if (!text) {
    return text;
  }

  return text.replace(ANSI_ESCAPE_PATTERN, "");
}
