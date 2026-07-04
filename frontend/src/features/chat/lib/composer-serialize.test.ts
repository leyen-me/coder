import { describe, expect, it } from "vitest";

import {
  deserializeAgentTextToDoc,
  looksLikeFilePath,
  resolveSkillReferenceAttrs,
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
  it("rehydrates workspace references and round-trips", () => {
    const doc = deserializeAgentTextToDoc("see @src/App.tsx and @lib/utils.ts");

    expect(serializeDocToAgentText(doc)).toBe(
      "see @src/App.tsx and @lib/utils.ts"
    );
  });

  it("produces workspaceReference nodes from @path patterns", () => {
    const doc = deserializeAgentTextToDoc("fix @src/App.tsx");

    const refNode = doc.content?.[0]?.content?.[2];
    expect(refNode).toBeDefined();
    expect(refNode!.type).toBe("workspaceReference");
    expect(refNode!.attrs).toEqual({
      path: "src/App.tsx",
      name: "App.tsx",
      isDir: false,
    });
  });

  it("produces skillReference nodes from /slug patterns", () => {
    const doc = deserializeAgentTextToDoc("run /code-review");

    const refNode = doc.content?.[0]?.content?.[2];
    expect(refNode).toBeDefined();
    expect(refNode!.type).toBe("skillReference");
    expect(refNode!.attrs).toEqual(resolveSkillReferenceAttrs("code-review"));
  });

  it("handles workspace reference at start of text", () => {
    const doc = deserializeAgentTextToDoc("@src/App.tsx is broken");

    const refNode = doc.content?.[0]?.content?.[0];
    expect(refNode).toBeDefined();
    expect(refNode!.type).toBe("workspaceReference");
    expect(refNode!.attrs).toEqual({
      path: "src/App.tsx",
      name: "App.tsx",
      isDir: false,
    });
  });

  it("handles skill reference at start of text", () => {
    const doc = deserializeAgentTextToDoc("/code-review");

    const refNode = doc.content?.[0]?.content?.[0];
    expect(refNode).toBeDefined();
    expect(refNode!.type).toBe("skillReference");
    expect(refNode!.attrs).toEqual(resolveSkillReferenceAttrs("code-review"));
  });

  it("interleaves workspace and skill references", () => {
    const text = "check @src/main.ts and /code-review then @src/utils.ts";
    const doc = deserializeAgentTextToDoc(text);

    expect(serializeDocToAgentText(doc)).toBe(text);

    const content = doc.content?.[0]?.content ?? [];
    const refNodes = content.filter(
      (n) => n.type === "workspaceReference" || n.type === "skillReference"
    );
    expect(refNodes).toHaveLength(3);
    expect(refNodes[0].type).toBe("workspaceReference");
    expect(refNodes[1].type).toBe("skillReference");
    expect(refNodes[2].type).toBe("workspaceReference");
  });

  it("returns empty paragraph for empty text", () => {
    const doc = deserializeAgentTextToDoc("");

    expect(doc).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [],
        },
      ],
    });
  });

  it("only creates skillReference nodes for enabled skills", () => {
    const isEnabledSkill = (slug: string) => slug === "code-review";

    const doc = deserializeAgentTextToDoc(
      "try /code-review and /blog",
      { isEnabledSkill }
    );

    const content = doc.content?.[0]?.content ?? [];
    const refNodes = content.filter((n) => n.type === "skillReference");

    // Only /code-review matches the filter, /blog stays as plain text
    expect(refNodes).toHaveLength(1);
    expect(refNodes[0].attrs).toEqual(
      resolveSkillReferenceAttrs("code-review")
    );
  });

  it("treats unmatched skill patterns as plain text", () => {
    const isEnabledSkill = () => false;

    const doc = deserializeAgentTextToDoc("text /unknown-slug more", {
      isEnabledSkill,
    });

    // No skillReference nodes should be created
    const refNodes =
      doc.content?.[0]?.content?.filter((n) => n.type === "skillReference") ??
      [];
    expect(refNodes).toHaveLength(0);
  });
});

describe("looksLikeFilePath", () => {
  it("accepts paths with directory separators", () => {
    expect(looksLikeFilePath("src/main.ts")).toBe(true);
    expect(looksLikeFilePath("a/b/c")).toBe(true);
  });

  it("accepts paths with file extensions", () => {
    expect(looksLikeFilePath("main.ts")).toBe(true);
    expect(looksLikeFilePath("Dockerfile.dev")).toBe(true);
    expect(looksLikeFilePath("Makefile")).toBe(false);
  });

  it("rejects bare words without separators or extensions", () => {
    expect(looksLikeFilePath("随便")).toBe(false);
    expect(looksLikeFilePath("random")).toBe(false);
    expect(looksLikeFilePath("john")).toBe(false);
  });

  it("accepts paths with both separator and extension", () => {
    expect(looksLikeFilePath("src/components/Button.tsx")).toBe(true);
  });
});
