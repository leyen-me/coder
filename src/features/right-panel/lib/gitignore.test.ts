import { describe, expect, it } from "vitest";

import { GitignoreMatcher } from "./gitignore";

describe("GitignoreMatcher", () => {
  describe("fromContent", () => {
    it("parses comments and blank lines", () => {
      const m = GitignoreMatcher.fromContent("# comment\n\n \nnode_modules\n");
      expect(m.ignores("node_modules", true)).toBe(true);
      expect(m.ignores("src/file.ts", false)).toBe(false);
    });

    it("parses negation patterns", () => {
      const m = GitignoreMatcher.fromContent(
        "*.log\n!important.log\n"
      );
      expect(m.ignores("debug.log", false)).toBe(true);
      expect(m.ignores("important.log", false)).toBe(false);
    });

    it("matches directory-only patterns", () => {
      const m = GitignoreMatcher.fromContent("dist/\n");
      expect(m.ignores("dist", true)).toBe(true);
      expect(m.ignores("dist", false)).toBe(false);
      expect(m.ignores("dist/file.js", false)).toBe(false);
    });

    it("matches wildcard patterns", () => {
      const m = GitignoreMatcher.fromContent("*.ts\n");
      expect(m.ignores("src/file.ts", false)).toBe(true);
      expect(m.ignores("file.ts", false)).toBe(true);
      expect(m.ignores("file.js", false)).toBe(false);
    });

    it("matches anchored patterns", () => {
      const m = GitignoreMatcher.fromContent("/build\n");
      expect(m.ignores("build", true)).toBe(true);
      expect(m.ignores("src/build", true)).toBe(false);
    });

    it("matches nested path patterns", () => {
      const m = GitignoreMatcher.fromContent("src/generated/\n");
      expect(m.ignores("src/generated", true)).toBe(true);
      expect(m.ignores("other/generated", true)).toBe(false);
    });

    it("matches ** globstar", () => {
      const m = GitignoreMatcher.fromContent("a/**/b\n");
      expect(m.ignores("a/b", false)).toBe(true);
      expect(m.ignores("a/x/b", false)).toBe(true);
      expect(m.ignores("a/x/y/b", false)).toBe(true);
    });

    it("matches typical node_modules pattern", () => {
      const m = GitignoreMatcher.fromContent("node_modules\n");
      expect(m.ignores("node_modules", true)).toBe(true);
    });

    it("matches .env pattern", () => {
      const m = GitignoreMatcher.fromContent(".env\n");
      expect(m.ignores(".env", false)).toBe(true);
    });

    it("handles .vscode/* with negation", () => {
      const content = ".vscode/*\n!.vscode/extensions.json\n";
      const m = GitignoreMatcher.fromContent(content);
      expect(m.ignores(".vscode/settings.json", false)).toBe(true);
      expect(m.ignores(".vscode/extensions.json", false)).toBe(false);
    });

    it("returns false for unmatched paths", () => {
      const m = GitignoreMatcher.fromContent("node_modules\n");
      expect(m.ignores("src/App.tsx", false)).toBe(false);
      expect(m.ignores("package.json", false)).toBe(false);
    });

    it("returns false when empty content", () => {
      const m = GitignoreMatcher.fromContent("");
      expect(m.ignores("any-file", false)).toBe(false);
    });
  });
});
