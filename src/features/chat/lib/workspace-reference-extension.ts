import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import type { WorkspaceReferenceAttrs } from "./composer-serialize";
import { WorkspaceReferenceNodeView } from "../components/workspace-reference-node";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    workspaceReference: {
      insertWorkspaceReference: (attrs: WorkspaceReferenceAttrs) => ReturnType;
    };
  }
}

export const WorkspaceReferenceExtension = Node.create({
  name: "workspaceReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      path: { default: null },
      name: { default: null },
      isDir: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-workspace-reference="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-workspace-reference": "true",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WorkspaceReferenceNodeView);
  },

  addCommands() {
    return {
      insertWorkspaceReference:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .run(),
    };
  },
});
