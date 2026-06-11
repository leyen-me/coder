const EXTENSION_LANGUAGE: Record<string, string> = {
  bash: "shell",
  c: "c",
  cpp: "cpp",
  css: "css",
  go: "go",
  html: "html",
  java: "java",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  mjs: "javascript",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "shell",
  sql: "sql",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  vue: "html",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell",
};

export function guessLanguageFromPath(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex === -1) {
    return "plaintext";
  }

  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  return EXTENSION_LANGUAGE[extension] ?? "plaintext";
}
