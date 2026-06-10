import { describe, expect, it } from "vitest";

import {
  deserializeAgentTextToDoc,
  resolveWorkspaceReferenceAttrs,
  serializeDocToAgentText,
} from "./composer-serialize";

describe("resolveWorkspaceReferenceAttrs", () => {
  it("derives basename when name is omitted", () => {
    expect(resolveWorkspaceReferenceAttrs("src/App.tsx")).toEqual({
      path: "src/App.tsx",
      name: "App.tsx",
      isDir: false,
    });
  });

  it("preserves explicit metadata", () => {
    expect(
      resolveWorkspaceReferenceAttrs("src/components", {
        name: "components",
        isDir: true,
      })
    ).toEqual({
      path: "src/components",
      name: "components",
      isDir: true,
    });
  });
});

describe("serializeDocToAgentText", () => {
  it("serializes inline references and surrounding text", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "fix " },
            {
              type: "workspaceReference",
              attrs: {
                path: "src/App.tsx",
                name: "App.tsx",
                isDir: false,
              },
            },
            { type: "text", text: " bug" },
          ],
        },
      ],
    };

    expect(serializeDocToAgentText(doc)).toBe("fix @src/App.tsx bug");
  });

  it("serializes reference-only prompts", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "workspaceReference",
              attrs: {
                path: "src/App.tsx",
                name: "App.tsx",
                isDir: false,
              },
            },
          ],
        },
      ],
    };

    expect(serializeDocToAgentText(doc)).toBe("@src/App.tsx");
  });
});

describe("deserializeAgentTextToDoc", () => {
  it("rehydrates mentions into reference nodes", () => {
    const doc = deserializeAgentTextToDoc("see @src/App.tsx and @lib/utils.ts");

    expect(serializeDocToAgentText(doc)).toBe(
      "see @src/App.tsx and @lib/utils.ts"
    );
  });
});
