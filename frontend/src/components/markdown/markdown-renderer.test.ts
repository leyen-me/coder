import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "./markdown-renderer";

function render(markdown: string): string {
  return renderToStaticMarkup(
    createElement(MarkdownRenderer, { children: markdown }),
  );
}

describe("MarkdownRenderer node attribute leakage", () => {
  it("does not leak the AST node object onto DOM elements", () => {
    const html = render(
      "# Heading\n\nA paragraph with `inline code` and a [link](https://example.com).\n\n- item one\n- item two\n",
    );

    // Regression guard: react-markdown passes a `node` (hast/Element) prop to
    // every custom component. Spreading `{...props}` onto the DOM used to emit
    // `node="[object Object]"` attributes on <p>, <code>, <a>, <li>, etc.
    expect(html).not.toContain('node="');
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("<p");
    expect(html).toContain("<code");
    expect(html).toContain("<a");
  });

  it("renders a fenced code block without a node attribute", () => {
    const html = render("```ts\nconst x = 1;\n```\n");

    expect(html).not.toContain('node="');
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("<code");
  });

  it("renders a table without a node attribute", () => {
    const html = render("| a | b |\n| - | - |\n| 1 | 2 |\n");

    expect(html).not.toContain('node="');
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("<table");
  });
});
