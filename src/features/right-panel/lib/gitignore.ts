/**
 * A self-contained gitignore pattern matcher.
 *
 * Supports the core gitignore specification:
 *   - Comment lines (#)
 *   - Negation (!)
 *   - Directory-only suffix (/)
 *   - Glob wildcards (*, **, ?)
 *   - Character classes ([...])
 *   - Anchored patterns (containing /)
 *
 * Does NOT match against parent `.gitignore` files from ancestor
 * directories — only the patterns that were loaded are used.
 */

// ---------------------------------------------------------------------------
// Pattern
// ---------------------------------------------------------------------------

type Pattern = {
  /** The raw pattern string after stripping leading `!`. */
  raw: string;
  /** Whether the pattern negates (starts with `!`). */
  negate: boolean;
  /** Whether the pattern only matches directories (ends with `/`). */
  dirOnly: boolean;
  /** Whether the pattern is "anchored" (contains `/` before the end). */
  anchored: boolean;
  /** The regex to test path segments against. */
  regex: RegExp;
};

// ---------------------------------------------------------------------------
// Regex helpers
// ---------------------------------------------------------------------------

function globToRegex(glob: string): string {
  let result = "";
  let i = 0;
  const len = glob.length;

  while (i < len) {
    const ch = glob[i];

    if (ch === "\\" && i + 1 < len) {
      // Escaped character — treat as literal
      result += escapeRegex(glob[i + 1]);
      i += 2;
      continue;
    }

    if (ch === "*") {
      if (i + 1 < len && glob[i + 1] === "*") {
        // ** — match zero or more path segments
        // Consume any trailing slash
        const slashAfter = i + 2 < len && glob[i + 2] === "/" ? 1 : 0;
        result += "(?:.+/)?";
        i += 2 + slashAfter;
        continue;
      }
      // * — match anything except /
      result += "[^/]*";
      i++;
      continue;
    }

    if (ch === "?") {
      result += "[^/]";
      i++;
      continue;
    }

    if (ch === "[") {
      // Character class — find the closing ]
      const close = findClosingBracket(glob, i);
      if (close === -1) {
        // No closing bracket — treat as literal
        result += "\\[";
        i++;
        continue;
      }
      result += glob.slice(i, close + 1);
      i = close + 1;
      continue;
    }

    result += escapeRegex(ch);
    i++;
  }

  return result;
}

function escapeRegex(ch: string): string {
  return "\\^$.+{}()|".includes(ch) ? `\\${ch}` : ch;
}

function findClosingBracket(str: string, start: number): number {
  // [!...] or [^...] negation — the first ] after the ! or ^ is not the closer
  let i = start + 1;
  if (i < str.length && (str[i] === "!" || str[i] === "^")) {
    i++;
  }
  if (i < str.length && str[i] === "]") {
    i++;
  }
  while (i < str.length) {
    if (str[i] === "]") return i;
    // Handle escaped backslash before bracket
    if (str[i] === "\\") i++;
    i++;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseLine(line: string): Pattern | null {
  const trimmed = line.trim();

  // Blank line
  if (trimmed.length === 0) return null;
  // Comment
  if (trimmed.startsWith("#")) return null;

  let raw = trimmed;
  let negate = false;

  // Negation
  if (raw.startsWith("!")) {
    negate = true;
    raw = raw.slice(1);
  }

  // Trailing spaces — only if not escaped
  // Simple rule: trim right (already trimmed above, but gitignore rules
  // say trailing spaces are ignored unless escaped with \)
  // For simplicity we keep trimmed behavior.

  // Directory-only
  let dirOnly = false;
  if (raw.endsWith("/")) {
    dirOnly = true;
    raw = raw.slice(0, -1);
  }

  if (raw.length === 0) return null;

  // Anchored: if the pattern contains a slash (after stripping leading
  // `/` and trailing `/`), it's anchored to the gitignore's directory.
  let anchored = raw.includes("/");
  let matchSource = raw;

  // Leading slash means anchored to root
  if (matchSource.startsWith("/")) {
    anchored = true;
    matchSource = matchSource.slice(1);
  }

  // Convert glob to regex
  const reSource = globToRegex(matchSource);

  let regex: RegExp;

  if (anchored) {
    // Matched relative to the .gitignore's directory — exact match
    regex = new RegExp(`^${reSource}$`);
  } else {
    // May match any segment (basename matching)
    regex = new RegExp(`(?:^|/)${reSource}$`);
  }

  return { raw, negate, dirOnly, anchored, regex };
}

// ---------------------------------------------------------------------------
// GitignoreMatcher
// ---------------------------------------------------------------------------

export class GitignoreMatcher {
  private patterns: Pattern[];

  private constructor(patterns: Pattern[]) {
    this.patterns = patterns;
  }

  /**
   * Create a matcher from the text content of a `.gitignore` file.
   */
  static fromContent(content: string): GitignoreMatcher {
    const patterns: Pattern[] = [];
    for (const line of content.split(/\r?\n/)) {
      const p = parseLine(line);
      if (p) patterns.push(p);
    }
    return new GitignoreMatcher(patterns);
  }

  /**
   * Return `true` if the given path **should be ignored**.
   *
   * @param relativePath  Path relative to the `.gitignore` directory.
   *                      Use forward slashes, no leading `./`.
   * @param isDir         Whether the path is a directory.
   */
  ignores(relativePath: string, isDir: boolean): boolean {
    // Normalise — strip leading ./, strip trailing /
    let path = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
    if (path.endsWith("/")) path = path.slice(0, -1);

    let ignored = false;

    for (const p of this.patterns) {
      // Directory-only pattern doesn't match files
      if (p.dirOnly && !isDir) continue;

      if (p.regex.test(path)) {
        ignored = !p.negate;
      }
    }

    return ignored;
  }
}
