import type { EditorState } from "@tiptap/pm/state";

export type ActiveComposerMention = {
  query: string;
  range: {
    from: number;
    to: number;
  };
};

const MENTION_PATTERN = /(?:^|\s)@([^\s@]*)$/;

export function parseActiveComposerMention(
  textBeforeCursor: string,
  cursorOffset: number,
  blockStart: number
): ActiveComposerMention | null {
  const match = textBeforeCursor.match(MENTION_PATTERN);
  if (!match) {
    return null;
  }

  const query = match[1] ?? "";
  const matchedText = match[0];
  const atOffset =
    cursorOffset -
    matchedText.length +
    (matchedText.startsWith("@") ? 0 : 1);

  return {
    query,
    range: {
      from: blockStart + atOffset,
      to: blockStart + cursorOffset,
    },
  };
}

export function getActiveComposerMention(
  state: EditorState
): ActiveComposerMention | null {
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

  return parseActiveComposerMention(
    textBefore,
    $from.parentOffset,
    $from.start()
  );
}

export function parentPathForMatch(path: string): string {
  const index = path.lastIndexOf("/");
  if (index <= 0) {
    return "";
  }

  return path.slice(0, index);
}
