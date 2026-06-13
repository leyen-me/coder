import type { SystemSkillDefinition } from "../types";

const TOOLS_CONTENT = `# Tools Rules

You can call tools when you need local filesystem, shell, or web information.
Use glob to find files by name pattern and grep to search file contents.
Use shell to run CLI commands (builds, tests, git). Commands run non-interactively.
For long-running commands (dev servers, watch mode), use shell with block_until_ms=0, then await with the returned shell_id.
Use web_search for real-time information outside training data, such as news, version numbers, or current events.
Use browse_page to read the full content of a specific URL, especially after web_search returns promising links.
browse_page does not render JavaScript-heavy pages. Prefer quoting tool output instead of inventing details.
Use list_skills to browse user-enabled skills (slug, name, description).
Use read_skill with a slug to load full skill instructions before following them.
Use create_skill when the user asks you to save reusable instructions as a custom skill.
Paths are resolved relative to workspaceDir unless noted otherwise.
When a tool fails, read the error code and message, then adjust your approach.
Prefer tools over guessing file, directory, or web page contents.
`;

const CODE_REVIEW_CONTENT = `# Code Review

When reviewing code:

1. Check correctness and edge cases
2. Verify security (injection, XSS, secrets in code)
3. Assess readability and maintainability
4. Ensure error handling is appropriate
5. Confirm tests cover meaningful behavior

Format feedback as:
- **Critical**: Must fix before merge
- **Suggestion**: Consider improving
- **Nice to have**: Optional enhancement
`;

const SEARCH_FIRST_CONTENT = `# Search-First Code Navigation

### The Trap

Tracing dependency chains from entry point → imports → each file is slow, fragile, and wastes context on irrelevant code.

### The Rule

Search before you read. Always.

Spend a few seconds thinking about what unique signal the target code would emit, then search for it directly (grep, glob). Only read a file after you have concrete evidence it contains the relevant code.

### Signal cheat sheet

| When looking for… | Search for | Example |
|---|---|---|
| A function / method | Its name | \`calculateTotal\`, \`handleSubmit\` |
| A constant / variable | Its name | \`MAX_RETRY_COUNT\`, \`workspaceName\` |
| An API route | The path string | \`"/api/users"\`, \`"/login"\` |
| A Spring Bean | Annotation | \`@RestController\`, \`@Service\` |
| A Rust trait / impl | The trait name | \`impl Iterator\`, \`trait Into\` |
| A test case | The test description | \`"should return 401"\`, \`testShould\` |
| A config value | The key name | \`database.url\`, \`logging.level\` |
| An ORM entity | Table or model name | \`table: "users"\`, \`class User\` |

### Before editing

- Copy \`old_string\` **verbatim** from the file. Do not re-type or reformat — silent match failures waste time.
- For multiline blocks, preserve exact indentation and line breaks.

### After changing

1. Run the project's type-check / compile (\`npx tsc --noEmit\`, \`cargo check\`, \`mvn compile\`, etc.).
2. Re-read the changed lines to visually confirm correctness.
3. Review \`git diff\` to ensure only intended changes are included.
`;

const COMMIT_HELPER_CONTENT = `# Commit Rules

- Review \`git status\` and \`git diff --staged\`
- Stage only task-related files; avoid \`git add .\` / \`git add -A\`
- Generate messages from staged changes only
- Use Conventional Commits: \`type(scope): summary\`
- Focus on why; do not invent context
- Subject < 72 chars
- "commit" = commit only
- "push" = push
`;

const TASK_PLANNING_CONTENT = `# Task Planning

The user can see a live task-progress panel in the chat UI. Use it to make multi-step work legible — not as a substitute for doing the work.

### When to create a task list

Create one when the work has **multiple meaningful steps** and progress would help the user follow along:

- Implementing a feature that spans exploration, code changes, and verification
- Refactoring or migrations across several files or layers
- Debugging with multiple hypotheses to test in sequence
- Finishing a user request that clearly has phases (design → implement → test → polish)
- Long-running agent work where the user may look away and return later

### When not to create a task list

Skip it for work that is effectively one move:

- Short answers, explanations, or opinions
- A single-file tweak, one command, or one obvious fix
- Pure exploration where the user only asked "how does X work?"
- Trivial follow-ups that complete in one tool pass

When unsure, prefer **no list** over a noisy list.

### How to break work down

Good steps are:

- **Outcome-oriented** — "Add IndexedDB migration" not "Open client.ts"
- **Coarse enough** — aim for roughly 3–7 steps, not micro-actions per tool call
- **User-visible** — write labels the user would recognize in the progress panel
- **Honest** — rename, add, or drop steps when scope changes mid-task

Bad steps: "Read file", "Think", "Call tool", or duplicating the same step in different words.

### How to work with the list

Treat the list as the contract for the current task:

1. **Plan first** on non-trivial requests — outline steps before diving into tools when that helps.
2. **One focus at a time** — only one step should be actively in progress.
3. **Close the loop** — mark a step done as soon as it is actually done, not at the end of the whole task.
4. **Reflect reality** — if the user pivots, update the list instead of silently drifting.
5. **Finish cleanly** — when everything is done, leave the list in a truthful end state (all completed, or cancelled items removed from the active plan).

### What the user cares about

The panel answers: *What are you doing? What's done? What's next?*

Your job is to keep that story accurate. Do not narrate the list in prose when the panel already shows it — use the chat for decisions, findings, and results instead of re-listing every step.
`;

export const SYSTEM_SKILLS: SystemSkillDefinition[] = [
  {
    id: "tools",
    slug: "tools",
    name: "Tools Rules",
    description:
      "How to use filesystem, shell, web, and skill tools available to the agent.",
    content: TOOLS_CONTENT,
    defaultEnabled: true,
    category: "core",
  },
  {
    id: "code-review",
    slug: "code-review",
    name: "Code Review",
    description:
      "Review code for quality, security, and maintainability following structured feedback format.",
    content: CODE_REVIEW_CONTENT,
    defaultEnabled: true,
    category: "development",
  },
  {
    id: "search-first-navigation",
    slug: "search-first-navigation",
    name: "Search-First Code Navigation",
    description:
      "Search before you read — use grep/glob to find relevant code directly instead of tracing dependency chains.",
    content: SEARCH_FIRST_CONTENT,
    defaultEnabled: true,
    category: "development",
  },
  {
    id: "commit-helper",
    slug: "commit-helper",
    name: "Commit Rules",
    description:
      "Generate conventional commit messages by analyzing git diffs and staged changes.",
    content: COMMIT_HELPER_CONTENT,
    defaultEnabled: true,
    category: "development",
  },
  {
    id: "task-planning",
    slug: "task-planning",
    name: "Task Planning",
    description:
      "When and how to use the session task-progress list for multi-step work the user can follow.",
    content: TASK_PLANNING_CONTENT,
    defaultEnabled: true,
    category: "core",
  },
];

const slugSet = new Set<string>();

for (const skill of SYSTEM_SKILLS) {
  if (slugSet.has(skill.slug)) {
    throw new Error(`Duplicate system skill slug: ${skill.slug}`);
  }
  slugSet.add(skill.slug);
}

export function getSystemSkillBySlug(
  slug: string
): SystemSkillDefinition | null {
  return SYSTEM_SKILLS.find((skill) => skill.slug === slug) ?? null;
}

export function getSystemSkillById(id: string): SystemSkillDefinition | null {
  return SYSTEM_SKILLS.find((skill) => skill.id === id) ?? null;
}

export function getAllSystemSkillSlugs(): Set<string> {
  return new Set(SYSTEM_SKILLS.map((skill) => skill.slug));
}
