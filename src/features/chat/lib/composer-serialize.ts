import type { Editor, JSONContent } from "@tiptap/core";

import { basenameTreePath } from "@/features/right-panel/lib/workspace-path-utils";

const WORKSPACE_REFERENCE_NODE = "workspaceReference";
const SKILL_REFERENCE_NODE = "skillReference";
const MENTION_PATTERN = /@([^\s@]+)/g;
const SKILL_SLUG_PATTERN = /\/([a-z0-9]+(?:-[a-z0-9]+)*)/g;

export type WorkspaceReferenceAttrs = {
  path: string;
  name: string;
  isDir: boolean;
};

export type SkillReferenceAttrs = {
  slug: string;
  name: string;
};

export function resolveWorkspaceReferenceAttrs(
  path: string,
  options?: { name?: string; isDir?: boolean }
): WorkspaceReferenceAttrs {
  return {
    path,
    name: options?.name ?? basenameTreePath(path),
    isDir: options?.isDir ?? false,
  };
}

export function resolveSkillReferenceAttrs(
  slug: string,
  options?: { name?: string }
): SkillReferenceAttrs {
  return {
    slug,
    name: options?.name ?? slug,
  };
}

function serializeParagraphContent(node: JSONContent): string {
  if (!node.content?.length) {
    return "";
  }

  let line = "";

  for (const child of node.content) {
    if (child.type === WORKSPACE_REFERENCE_NODE) {
      const path = child.attrs?.path;
      if (typeof path === "string" && path.length > 0) {
        line += `@${path}`;
      }
      continue;
    }

    if (child.type === SKILL_REFERENCE_NODE) {
      const slug = child.attrs?.slug;
      if (typeof slug === "string" && slug.length > 0) {
        line += `/${slug}`;
      }
      continue;
    }

    if (child.type === "hardBreak") {
      line += "\n";
      continue;
    }

    if (child.type === "text" && typeof child.text === "string") {
      line += child.text;
    }
  }

  return line;
}

export function serializeEditorToAgentText(editor: Editor): string {
  const lines: string[] = [];

  editor.state.doc.forEach((node) => {
    if (node.type.name !== "paragraph") {
      return;
    }

    let line = "";

    node.forEach((child) => {
      if (child.type.name === WORKSPACE_REFERENCE_NODE) {
        line += `@${child.attrs.path as string}`;
        return;
      }

      if (child.type.name === SKILL_REFERENCE_NODE) {
        line += `/${child.attrs.slug as string}`;
        return;
      }

      if (child.type.name === "hardBreak") {
        line += "\n";
        return;
      }

      if (child.isText) {
        line += child.text ?? "";
      }
    });

    lines.push(line);
  });

  return lines.join("\n").trim();
}

export function extractSkillSlugsFromEditor(editor: Editor): string[] {
  const slugs: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === SKILL_REFERENCE_NODE) {
      const slug = node.attrs.slug as string | undefined;
      if (typeof slug === "string" && slug.length > 0) {
        slugs.push(slug);
      }
    }
  });

  return slugs;
}

export function editorHasInlineReferences(editor: Editor): boolean {
  let found = false;

  editor.state.doc.descendants((node) => {
    if (
      node.type.name === WORKSPACE_REFERENCE_NODE ||
      node.type.name === SKILL_REFERENCE_NODE
    ) {
      found = true;
      return false;
    }
  });

  return found;
}

export function editorHasWorkspaceReferences(editor: Editor): boolean {
  let found = false;

  editor.state.doc.descendants((node) => {
    if (node.type.name === WORKSPACE_REFERENCE_NODE) {
      found = true;
      return false;
    }
  });

  return found;
}

/**
 * Pattern matching workspace references (`@path`) at word boundaries.
 * A path may contain `/` but must not contain spaces or `@`.
 */
const WORKSPACE_REF_PATTERN = /(?:^|\s)@([^\s@]+)/g;

/**
 * Pattern matching skill references (`/slug`) at word boundaries.
 * A slug is kebab-case: lowercase letters, digits, and hyphens.
 */
const SKILL_REF_PATTERN = /(?:^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)/g;

export function deserializeAgentTextToDoc(text: string): JSONContent {
  const paragraphContent: JSONContent[] = [];

  // Collect all reference tokens with their positions.
  type Token =
    | { type: "workspace"; value: string; start: number; end: number }
    | { type: "skill"; value: string; start: number; end: number };

  const tokens: Token[] = [];

  let match: RegExpExecArray | null;

  WORKSPACE_REF_PATTERN.lastIndex = 0;
  while ((match = WORKSPACE_REF_PATTERN.exec(text)) !== null) {
    tokens.push({
      type: "workspace",
      value: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  SKILL_REF_PATTERN.lastIndex = 0;
  while ((match = SKILL_REF_PATTERN.exec(text)) !== null) {
    tokens.push({
      type: "skill",
      value: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Sort by start position, then prefer workspace over skill when overlapping
  // (e.g. path `@src/plan` also matches `/plan` as a skill reference).
  tokens.sort((a, b) => a.start - b.start || (a.type === "workspace" ? -1 : 1));

  const merged: Token[] = [];
  for (const token of tokens) {
    const prev = merged.at(-1);
    if (prev && token.start < prev.end) {
      continue; // overlap — keep the earlier token
    }
    merged.push(token);
  }

  let cursor = 0;
  for (const token of merged) {
    // Text before this token's boundary character
    if (token.start > cursor) {
      paragraphContent.push({ type: "text", text: text.slice(cursor, token.start) });
    }

    // The leading boundary character (whitespace) before the reference sigil
    // Non-capturing group (?:^|\s) consumed it as part of match[0].
    if (token.start > 0) {
      paragraphContent.push({ type: "text", text: text[token.start] });
    }

    // The reference node
    if (token.type === "workspace") {
      paragraphContent.push({
        type: WORKSPACE_REFERENCE_NODE,
        attrs: resolveWorkspaceReferenceAttrs(token.value),
      });
    } else {
      paragraphContent.push({
        type: SKILL_REFERENCE_NODE,
        attrs: resolveSkillReferenceAttrs(token.value),
      });
    }

    cursor = token.end;
  }

  // Remaining text after the last token
  if (cursor < text.length) {
    paragraphContent.push({ type: "text", text: text.slice(cursor) });
  }

  // Empty text still produces an empty paragraph so the editor is editable
  if (paragraphContent.length === 0) {
    paragraphContent.push({ type: "text", text: "" });
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: paragraphContent,
      },
    ],
  };
}

export function serializeDocToAgentText(doc: JSONContent): string {
  if (!doc.content?.length) {
    return "";
  }

  const lines = doc.content
    .filter((node) => node.type === "paragraph")
    .map((node) => serializeParagraphContent(node));

  return lines.join("\n").trim();
}

export { MENTION_PATTERN, SKILL_SLUG_PATTERN };
