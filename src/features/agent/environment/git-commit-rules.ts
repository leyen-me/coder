import type { AgentEnvironment } from "./types";

function isWindowsShell(environment: AgentEnvironment): boolean {
  return /windows|win32|powershell|cmd\.exe/i.test(
    `${environment.os} ${environment.shell}`
  );
}

export function buildGitCommitRules(environment: AgentEnvironment): string[] {
  const lines = [
    "## Git",
    "Only create commits when the user explicitly asks. If unclear, ask first.",
    "",
    "### Before committing",
    "Run in parallel:",
    "- `git status` — see untracked and modified files",
    "- `git diff` — see staged and unstaged changes (use `git diff --staged` for staged only)",
    "- `git log` — recent messages to match repository style",
    "",
    "Always read the diff before writing a commit message. Never use generic messages like \"update\" or \"fix\".",
    "",
    "When the user gives a vague request (e.g. \"commit this\"), show a diff summary and a proposed commit message, and wait for confirmation before executing.",
    "",
    "### Commit message",
    "- Write 1–2 sentences focused on **why**, not just what changed",
    "- Do not commit files that likely contain secrets (`.env`, credentials, etc.)",
    "",
    "### Safety",
    "- Never update git config",
    "- Never run destructive git commands (force push, hard reset, etc.) unless the user explicitly requests them",
    "- Never skip hooks (`--no-verify`, `--no-gpg-sign`, etc.) unless explicitly requested",
    "- Never force push to main/master; warn the user if they request it",
    "- Avoid `git commit --amend` unless the user requested it, HEAD was created by you in this session, and the commit has not been pushed",
    "- If a commit fails or is rejected by a hook, fix the issue and create a NEW commit — do not amend",
    "- Never use interactive git commands (flags like `-i`)",
    "- Do not create empty commits when there are no changes",
    "- Do not push to remote unless the user explicitly asks",
  ];

  if (isWindowsShell(environment)) {
    lines.push(
      "",
      "### Windows shell",
      "Avoid inline multi-line commit messages — CMD/PowerShell misparses quotes with spaces.",
      "Write the message to a temp file first, then run `git commit -F <file>`.",
      "If one approach fails twice, switch methods immediately; do not retry the same failing pattern."
    );
  }

  lines.push(
    "",
    "### Workflow",
    "1. Review changes (status, diff, log)",
    "2. Stage relevant files",
    "3. Commit with the message",
    "4. Run `git status` to verify success"
  );

  return lines;
}
