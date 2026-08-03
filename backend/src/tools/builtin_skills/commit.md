---
name: commit
description: Create a clean, conventional Git commit for the current change set with a precise subject and body.
---

# Commit

Guidance for producing a high-quality Git commit when the user asks to commit, or when a
logically complete change is ready to be saved.

## When to use

- The user explicitly asks to commit ("提交一下", "commit this", "创建提交").
- A change is logically complete, builds, and the tests pass — propose a commit rather than
  leaving the working tree dirty.

## Rules

1. Stage only files related to the current task. Never `git add -A` blindly; review the diff
   first with `git status` and `git diff`.
2. Prefer a new commit over amending an existing one unless the user explicitly asks to amend.
3. Follow the repository's existing convention. If a scope/type prefix is used (e.g.
   `feat:`, `fix:`, `refactor:`), match it.
4. Subject line: imperative mood, lowercase start (unless a proper noun), <= 72 chars, no
   trailing period.
5. Body: explain *why*, not *what*. Wrap at ~72 columns. Reference issues/PRs only when
   relevant.

## Anti-patterns

- Vague subjects ("updates", "fixes", "changes").
- Bundling unrelated changes into one commit.
- Committing secrets, build artifacts, or local config.
