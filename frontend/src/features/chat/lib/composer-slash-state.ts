import type { EditorState } from "@tiptap/pm/state";

export type ActiveSlashState = {
  query: string;
  range: {
    from: number;
    to: number;
  };
};

const SLASH_PATTERN = /(?:^|\s)\/([a-z0-9-]*)$/;

export function parseActiveSlashState(
  textBeforeCursor: string,
  cursorOffset: number,
  blockStart: number
): ActiveSlashState | null {
  const match = textBeforeCursor.match(SLASH_PATTERN);
  if (!match) {
    return null;
  }

  const query = match[1] ?? "";
  const matchedText = match[0];
  const slashOffset =
    cursorOffset -
    matchedText.length +
    (matchedText.startsWith("/") ? 0 : 1);

  return {
    query,
    range: {
      from: blockStart + slashOffset,
      to: blockStart + cursorOffset,
    },
  };
}

export function getActiveSlashState(
  state: EditorState
): ActiveSlashState | null {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock || !$from.parent.type.isTextblock) {
    return null;
  }

  const textBefore = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    "\ufffc"
  );

  return parseActiveSlashState(textBefore, $from.parentOffset, $from.start());
}
