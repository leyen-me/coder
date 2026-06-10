import type { Editor, JSONContent } from "@tiptap/core";

import { basenameTreePath } from "@/features/right-panel/lib/workspace-path-utils";

const WORKSPACE_REFERENCE_NODE = "workspaceReference";
const MENTION_PATTERN = /@([^\s@]+)/g;

export type WorkspaceReferenceAttrs = {
  path: string;
  name: string;
  isDir: boolean;
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

export function deserializeAgentTextToDoc(text: string): JSONContent {
  const paragraphContent: JSONContent[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      paragraphContent.push({
        type: "text",
        text: text.slice(lastIndex, index),
      });
    }

    const path = match[1];
    paragraphContent.push({
      type: WORKSPACE_REFERENCE_NODE,
      attrs: resolveWorkspaceReferenceAttrs(path),
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    paragraphContent.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: paragraphContent.length > 0 ? paragraphContent : undefined,
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
