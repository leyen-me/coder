import type { BundledLanguage } from "shiki";

const EXTENSION_LANGUAGE: Record<string, BundledLanguage> = {
  bash: "bash",
  c: "c",
  cpp: "cpp",
  css: "css",
  go: "go",
  html: "html",
  java: "java",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  md: "markdown",
  mjs: "javascript",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

export function guessLanguageFromPath(path: string): BundledLanguage {
  const fileName = path.split("/").pop() ?? path;
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex === -1) {
    return "text" as BundledLanguage;
  }

  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  return EXTENSION_LANGUAGE[extension] ?? ("text" as BundledLanguage);
}
