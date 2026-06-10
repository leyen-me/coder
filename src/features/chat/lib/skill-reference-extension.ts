import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import type { SkillReferenceAttrs } from "./composer-serialize";
import { SkillReferenceNodeView } from "../components/skill-reference-node";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    skillReference: {
      insertSkillReference: (attrs: SkillReferenceAttrs) => ReturnType;
    };
  }
}

export const SkillReferenceExtension = Node.create({
  name: "skillReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      slug: { default: null },
      name: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-skill-reference="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-skill-reference": "true",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SkillReferenceNodeView);
  },

  addCommands() {
    return {
      insertSkillReference:
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
