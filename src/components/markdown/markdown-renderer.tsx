"use client";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme/theme-provider";
import mermaid from "mermaid";
import type { ComponentProps, ReactNode } from "react";
import {
  Children,
  isValidElement,
  memo,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { BundledLanguage } from "shiki";

type MarkdownRendererProps = {
  children: string;
  className?: string;
  animated?: boolean;
  isAnimating?: boolean;
};

type CodeElementProps = {
  className?: string;
  children?: ReactNode;
};

function getTextContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getTextContent(child.props.children);
      }

      return "";
    })
    .join("");
}

function extractCodeBlock(children: ReactNode): {
  code: string;
  language?: string;
} | null {
  const [firstChild] = Children.toArray(children);

  if (!isValidElement<CodeElementProps>(firstChild)) {
    return null;
  }

  const className = firstChild.props.className;
  const language = className?.match(/language-([\w-]+)/)?.[1]?.toLowerCase();
  const code = getTextContent(firstChild.props.children).replace(/\n$/, "");

  return { code, language };
}

function normalizeLanguage(language?: string): BundledLanguage {
  return (language?.trim().toLowerCase() || "text") as BundledLanguage;
}

function MarkdownLink({
  className,
  href,
  children,
  ...props
}: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "font-medium text-primary underline underline-offset-4 break-all",
        className
      )}
      href={href}
      rel="noreferrer noopener"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const { resolved } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolved === "dark" ? "dark" : "default",
        });

        const renderId = `mermaid-${id.replace(/:/g, "-")}`;
        const { svg: renderedSvg } = await mermaid.render(renderId, code);

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvg(null);
          setError(
            renderError instanceof Error
              ? renderError.message
              : "Failed to render mermaid diagram."
          );
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, id, resolved]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">
          Mermaid 渲染失败，已回退为代码块。
        </p>
        <CodeBlock code={code} language={"text" as BundledLanguage} />
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        正在渲染 Mermaid 图...
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-background p-4">
      <div
        className="min-w-max [&_svg]:h-auto [&_svg]:max-w-none"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "kbd",
    "mark",
    "sub",
    "sup",
  ],
};

const markdownComponents: Components = {
  a: MarkdownLink,
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "my-4 border-l-2 border-border pl-4 text-muted-foreground italic",
        className
      )}
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    if (className?.includes("language-")) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return (
      <code
        className={cn(
          "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  details: ({ className, ...props }) => (
    <details
      className={cn("my-4 rounded-md border border-border p-4", className)}
      {...props}
    />
  ),
  h1: ({ className, ...props }) => (
    <h1 className={cn("mt-6 mb-3 text-2xl font-semibold", className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("mt-6 mb-3 text-xl font-semibold", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mt-5 mb-2 text-lg font-semibold", className)} {...props} />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-6 border-border", className)} {...props} />
  ),
  img: ({ className, alt, ...props }) => (
    <img
      alt={alt}
      className={cn("my-4 max-w-full rounded-md border border-border", className)}
      {...props}
    />
  ),
  li: ({ className, ...props }) => <li className={cn("my-1", className)} {...props} />,
  ol: ({ className, ...props }) => (
    <ol className={cn("my-4 list-decimal pl-6", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn("my-4 whitespace-pre-wrap wrap-break-word", className)}
      {...props}
    />
  ),
  pre: ({ children }) => {
    const block = extractCodeBlock(children);

    if (!block) {
      return (
        <pre className="my-4 overflow-x-auto rounded-md border bg-muted/30 p-4">
          {children}
        </pre>
      );
    }

    if (block.language === "mermaid") {
      return <MermaidBlock code={block.code} />;
    }

    return (
      <CodeBlock
        code={block.code}
        language={normalizeLanguage(block.language)}
      />
    );
  },
  table: ({ className, children, ...props }) => (
    <div className="my-4 w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  tbody: ({ className, ...props }) => (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
  td: ({ className, ...props }) => (
    <td className={cn("border border-border px-3 py-2 align-top", className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border border-border bg-muted/50 px-3 py-2 text-left font-medium",
        className
      )}
      {...props}
    />
  ),
  summary: ({ className, ...props }) => (
    <summary className={cn("cursor-pointer font-medium", className)} {...props} />
  ),
  tr: ({ className, ...props }) => (
    <tr className={cn("border-b border-border", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("my-4 list-disc pl-6", className)} {...props} />
  ),
};

export const MarkdownRenderer = memo(function MarkdownRenderer({
  children,
  className,
}: MarkdownRendererProps) {
  const content = useMemo(() => children, [children]);

  if (!content.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        "size-full text-sm leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 **:wrap-break-word",
        className
      )}
    >
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex]}
        remarkPlugins={[remarkGemoji, remarkGfm, remarkMath]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
