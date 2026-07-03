import type { EditorState } from "@tiptap/pm/state";

export type ActiveComposerSkill = {
  query: string;
  range: {
    from: number;
    to: number;
  };
};

const SKILL_PATTERN = /(?:^|\s)\/([a-z0-9-]*)$/;

export function parseActiveComposerSkill(
  textBeforeCursor: string,
  cursorOffset: number,
  blockStart: number
): ActiveComposerSkill | null {
  const match = textBeforeCursor.match(SKILL_PATTERN);
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

export function getActiveComposerSkill(
  state: EditorState
): ActiveComposerSkill | null {
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

  return parseActiveComposerSkill(
    textBefore,
    $from.parentOffset,
    $from.start()
  );
}
