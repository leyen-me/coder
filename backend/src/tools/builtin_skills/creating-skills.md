---
name: creating-skills
description: How to create and manage reusable skills (SKILL.md files) for the Coder project
---

# Creating Skills

A skill is a reusable Markdown instruction file (`SKILL.md`) that an agent can load via `/slug` references. Skills live in dedicated directories under user or workspace roots.

## Skill Locations

| Scope | Root Path | Priority |
|---|---|---|
| **User** | `~/.coder/skills/<skill-name>/SKILL.md` | Higher — personal customizations |
| **Workspace** | `<project-root>/.coder/skills/<skill-name>/SKILL.md` | Lower — team-shared conventions |

When the same slug exists in both locations, the **user** scope takes precedence.

## Directory Structure

```
~/.coder/skills/
├── <skill-name>/          # kebab-case directory name
│   ├── SKILL.md           # the skill file (filename must be exactly SKILL.md)
│   ├── scripts/           # optional: executable code
│   ├── references/        # optional: docs loaded on demand
│   └── assets/            # optional: templates, images, data files
└── another-skill/
    └── SKILL.md
```

## Optional Directories

Besides `SKILL.md`, a skill may ship extra files in dedicated directories so agents know exactly where to put things:

| Directory | Purpose | What goes in it |
|---|---|---|
| `scripts/` | Executable code | Python, shell, or other runnable scripts |
| `references/` | Additional docs loaded on demand | Detailed guides, checklists, extended examples — keep `SKILL.md` short and load these only when needed |
| `assets/` | Non-code resources | Templates, images, data files (e.g. `template.xlsx`) |

Rules:
- Reference files with **relative paths** from `SKILL.md`, e.g. `scripts/build.py`, `references/guide.md`, `assets/template.xlsx`.
- Keep content **one level deep** under each directory — avoid deep nesting.
- Create a directory only when the skill actually needs it; a pure-instruction skill needs nothing but `SKILL.md`.

## SKILL.md Format

Every skill file must start with standard frontmatter:

```markdown
---
name: <skill-name>
description: A short one-line description of what this skill covers
---

# <Skill Title>

## Section

Guidelines, rules, and conventions...
```

### Frontmatter rules

| Field | Required | Description |
|---|---|---|
| `name` | ✅ Yes | Kebab-case slug, must match the parent directory name |
| `description` | ✅ Yes | Single line, plain text, no formatting |

## Naming Conventions

- Directory and `name` must match: `ssh-remote/` → `name: ssh-remote`
- Use **kebab-case** only: `react-frontend`, `git-workflow`, `db-migrations`
- Keep names short but unambiguous

## Content Guidelines

- **Be concise and actionable** — agents read these to follow rules, not to browse documentation.
- **Use lists** — bullet points and checklists work better than prose paragraphs.
- **Reference project-specific code, tools, and conventions** — generic advice is less useful.
- **Cover the "why" when the rule is non-obvious**, but keep the "what" first.
- **Avoid duplicating** information that lives in other skills. Cross-reference with `/slug` instead.

## What Makes a Good Skill

✅ Good topics:
- Language or framework conventions (`rust-project`, `react-frontend`)
- Workflows and processes (`git-workflow`, `creating-skills`)
- Tool-specific guidance (`ssh-remote`, `scheduled-jobs`)
- Testing and quality standards

❌ Poor topics:
- Trivial or single-rule items — keep it too narrow and it won't be worth loading
- Content that changes too fast to keep updated
- Personal preferences without team or project rationale

## Testing a Skill

After creating or editing a skill, reference it in a conversation with `/<skill-name>` to verify the agent loads and follows it correctly.